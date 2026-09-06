"""
Base contract for monitoring modules.

Every AI capability in the platform (restricted zone, PPE, gloves, doors, and
anything added later) is implemented as a subclass of BaseMonitoringService.
The rest of the system — routing, streaming, the frontend — only ever talks to
this interface, so adding a new capability never requires touching shared code.

A service owns three things:

    1. how a frame is analysed          -> process()
    2. what the current state is        -> get_results()
    3. how it is configured, if at all  -> configure() / get_config()
"""

import copy
import time
from abc import ABC, abstractmethod
from typing import Any, Optional

import numpy as np

#: How long after its last result a module is still considered to be watching.
#:
#: Long enough to ride out a slow frame on a loaded GPU or a stuttering link,
#: short enough that stopping a camera is reflected before anyone reads the
#: screen twice.
WATCHING_TIMEOUT = 5.0


class BaseMonitoringService(ABC):
    """
    Interface every monitoring module implements.

    Subclasses must set `module_id`, `name` and `description`, and implement
    `process()`. Everything else has a working default.

    `module_id` is used as the API path segment (``/api/<module_id>``) and as
    the key in the module registry, so it must be URL-safe and stable — the
    frontend registry refers to modules by this value.
    """

    #: URL-safe identifier, e.g. "restricted-zone". Also the API prefix.
    module_id: str = ""

    #: Operator-facing name. Shown in the UI, so no AI jargon.
    name: str = ""

    #: One-line description of what the module watches for.
    description: str = ""

    def __init__(self) -> None:
        self._last_result: dict[str, Any] = self.empty_result()

        # Deliberately long ago, so a module that has never analysed anything
        # does not claim to be watching.
        self._updated_at: float = float("-inf")

        # Set on a session copy; see _store().
        self._origin: Optional["BaseMonitoringService"] = None

        # The moment the *footage* says it is, when its burned-in clock
        # could be read — an `app.vision.frame_clock.ResolvedStamp`, or None.
        #
        # Set by whichever path is feeding this copy, immediately before
        # process(). Most modules never look at it: what a module reports
        # about a picture does not depend on when the picture was taken.
        # It matters to anything whose verdict is a function of the clock —
        # a curfew is only a breach if it happened during the curfew, and
        # judging last night's recording by this morning's clock would
        # answer about the wrong hours.
        self.observed_clock = None

        # Whether this copy is judging one still rather than a stream.
        #
        # Modules that settle a verdict over several frames cannot do so for
        # a photo — there is no next frame to confirm with, and the operator
        # asked about *this* picture. Set by the photo endpoint; a stream
        # leaves it false and keeps its confirmation rules.
        self.single_frame: bool = False

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    @abstractmethod
    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Analyse a single frame.

        Args:
            frame: BGR image as read from the camera.

        Returns:
            (annotated_frame, result) where `annotated_frame` is what the
            operator sees in the live view, and `result` is a JSON-serialisable
            summary of the current state — the shape returned by
            `empty_result()`, with values filled in.

        Implementations must not mutate `frame` in place; callers may reuse it.
        """
        raise NotImplementedError

    def empty_result(self) -> dict[str, Any]:
        """
        The result shape when nothing has been analysed yet.

        Subclasses should override to add their own fields, keeping these keys
        so the frontend can render any module with the same components.

        `regions` and `zones` carry the geometry the browser draws over its own
        camera picture. Returning shapes instead of a painted frame keeps the
        answer to about a kilobyte rather than the eighty an annotated JPEG
        costs, and lets the operator watch their camera at its own smooth frame
        rate with the findings laid on top — rather than a slideshow of
        pictures that have been to the server and back.

        Coordinates are fractions of the picture, so they survive whatever size
        the video is displayed at without anything having to agree on a
        resolution.
        """
        return {
            "alert": False,
            "status": "idle",
            "summary": "Not monitoring",
            "detections": [],
            "regions": [],
            "zones": [],
            # Whether the picture could be judged at all, and how many people
            # were seen but not judged.
            #
            # Here rather than in each module because the first attempt put
            # them in each module, and three of the seven had no owner: the
            # restricted zone went on saying "Area clear" on a picture where
            # it could find neither of the two people in it, and face
            # recognition reported "nobody recognized" at sixteen quality
            # levels it could not see through. A guarantee that every module
            # is supposed to make belongs where every module inherits it.
            **self.uncertainty(),
        }

    def uncertainty(
        self,
        reading: Any = None,
        unverified: int = 0,
    ) -> dict[str, Any]:
        """
        The three keys every module reports about what it could not judge.

        Args:
            reading: an `app.vision.legibility.Reading`, or None when the
                module has not looked at a picture.
            unverified: people seen but not judged.

        Returns:
            ``readable``, ``unreadable_reason`` and ``people_unverified``.

        A module with nothing to say still says it — the absence of these
        keys reads on screen exactly like a confident all-clear, which is the
        failure this phase exists to remove.
        """
        readable = True if reading is None else bool(reading.readable)
        reason = None if reading is None else reading.reason

        return {
            "readable": readable,
            "unreadable_reason": reason,
            "people_unverified": int(unverified),
        }

    @staticmethod
    def region(box, width, height, label=None, tone="neutral", outline=None, **extra):
        """
        One labelled shape for the browser to draw.

        Args:
            box: (x1, y1, x2, y2) in the picture's own pixels.
            width, height: the picture's size, used to make it resolution-free.
            label: what to write on it, in operator language.
            tone: how it should read — "ok", "danger", "warning" or "muted".
            outline: optional [(x, y), ...] tracing the subject itself, from a
                segmentation mask. Drawn in place of the box where a model
                supplies one: an outline around a person is unmistakably a
                person, where a rectangle could as easily be the machine
                behind them. The box is always sent as well, both to anchor
                the label and as the fallback when there is no mask.
        """
        x1, y1, x2, y2 = box

        shape = {
            "box": [
                round(x1 / width, 4),
                round(y1 / height, 4),
                round(x2 / width, 4),
                round(y2 / height, 4),
            ],
            "label": label,
            "tone": tone,
            **extra,
        }

        if outline:
            shape["outline"] = [
                [round(x / width, 4), round(y / height, 4)] for x, y in outline
            ]

        return shape

    # ------------------------------------------------------------------
    # History
    # ------------------------------------------------------------------

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        What is wrong *right now*, for the record to keep.

        Called on every analysed frame. Return one entry per distinct problem:

            {"key": "no-helmet",          # what, not when
             "severity": "medium",        # low | medium | high
             "summary": "2 without a helmet",
             "details": {...}}            # anything worth keeping, per module

        `key` identifies the problem rather than the moment. The same key on
        the next frame is understood as the same situation continuing, so a
        door open for five minutes is one escalating event rather than three
        thousand rows — see EventStore.observe. Choose a key that stays the
        same while the situation does, and differs when it is genuinely a
        different problem.

        The default records nothing, so a module opts in rather than having a
        history invented for it.
        """
        return []

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    def get_results(self) -> dict[str, Any]:
        """Most recent result produced by `process()`."""
        return self._last_result

    def reset(self) -> None:
        """Clear state. Called when a module's camera source changes."""
        self._last_result = self.empty_result()

        # Not watching until something is actually analysed again, or the
        # figures from the old camera would look current under the new one.
        self._updated_at = float("-inf")

    def for_session(self) -> "BaseMonitoringService":
        """
        A copy of this module with its own per-session state.

        The registered service is a process-wide singleton, which is fine for
        one server-side camera but wrong the moment several browsers push
        their own cameras at the same module: they would share one result
        slot, one set of tracked objects, and one set of counters, so each
        would see the others' analysis mixed into its own.

        The copy is shallow, so the loaded model — the expensive part — is
        shared, while anything mutable and per-session is rebuilt. Subclasses
        holding their own state override `reset_session_state()`.
        """
        clone = copy.copy(self)
        clone._origin = self
        clone.reset_session_state()
        clone._last_result = clone.empty_result()
        return clone

    def reset_session_state(self) -> None:
        """
        Rebuild mutable per-session state on a fresh copy.

        Overridden by modules that track things across frames. Anything left
        shared here is shared between every connected browser.
        """
        return None

    def get_status(self) -> dict[str, Any]:
        """Module identity and readiness, for the module list and page header."""
        return {
            "module_id": self.module_id,
            "name": self.name,
            "description": self.description,
            # Set up and able to watch, which is not the same as watching.
            "ready": self.is_ready(),
            # The two facts `ready` is made of, reported separately.
            #
            # A module that needs both a model and an operator's setup used to
            # answer only "ready: false" for either, and the screen had to
            # guess which — so a fresh install with nothing marked yet was told
            # the AI was not installed on the system, about a module whose
            # weights had loaded perfectly. Naming the two facts lets the page
            # say which one is missing, and what to do about it.
            "model_loaded": self.model_loaded(),
            "configured": self.is_configured(),
            # Actually receiving frames right now.
            "watching": self.is_watching(),
            "configurable": self.is_configurable(),
        }

    def is_ready(self) -> bool:
        """
        Whether the module can analyse frames right now.

        Modules that load their own weights override this to report a missing
        model file rather than failing on the first frame.
        """
        return True

    def model_loaded(self) -> bool:
        """
        Whether this module's model is available.

        True by default, because a module that carries no weights of its own
        has nothing that can fail to load — the honest answer for it is that
        the AI side is fine.
        """
        return True

    def is_configured(self) -> bool:
        """
        Whether the operator has set this module up.

        True by default: a module that needs nothing drawn or marked is set up
        the moment it exists, and should never appear on screen as waiting for
        an operator who has nothing to do.
        """
        return True

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        """Whether this module accepts configuration (e.g. a drawn zone)."""
        return False

    def get_config(self) -> Optional[dict[str, Any]]:
        """Current configuration, or None if the module has none."""
        return None

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Apply configuration. Overridden by modules that support it.

        Raises:
            NotImplementedError: if the module is not configurable.
        """
        raise NotImplementedError(
            f"Module '{self.module_id}' is not configurable"
        )

    # ------------------------------------------------------------------

    def _store(self, result: dict[str, Any]) -> dict[str, Any]:
        """
        Record `result` as the latest state and return it, for use in process().

        Stamped with the time, because "is this module watching" has no other
        honest answer. Readiness only says the model loaded and the module is
        configured — it stays true with every camera unplugged, which had the
        dashboard reporting three modules watching and no cameras connected on
        the same screen.
        """
        self._last_result = result

        now = time.monotonic()
        self._updated_at = now

        # A session copy also reports back to the module it came from. Frames
        # pushed by a browser only ever reach the copy, so without this the
        # dashboard — which reads the registered module — would report nothing
        # being watched while an operator was watching their own camera, and
        # then, having noticed, read an empty result off the module and report
        # a confident zero people and no alarm during an intrusion.
        #
        # Several browsers on one module means the last one to answer wins
        # here. That is the same best-effort aggregate the dashboard has
        # always been: each session still sees only its own analysis, over its
        # own socket. Nothing an operator acts on is decided by this value.
        if self._origin is not None:
            self._origin._updated_at = now
            self._origin._last_result = result

        return result

    def is_watching(self) -> bool:
        """
        Whether frames are actually arriving right now.

        Measured from when a result was last produced rather than from the
        camera, because frames reach a module by two routes — the server's own
        capture and a browser pushing its camera — and only one of them is
        something the camera manager knows about.
        """
        return (time.monotonic() - self._updated_at) < WATCHING_TIMEOUT

    def seconds_since_result(self) -> float:
        """How long since this module last produced anything."""
        return time.monotonic() - self._updated_at

    def __repr__(self) -> str:
        return f"<{type(self).__name__} module_id={self.module_id!r}>"
