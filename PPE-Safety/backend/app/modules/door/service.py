"""
Door monitoring.

The model reports a door's state directly — `open` or `closed` — so detection
is straightforward. The value of this module is in what happens next: a door
being open is normal, a door being open *for too long* is the safety and
security event.

Duration is tracked here in memory, per door, across frames. That is enough
for the live open-timer, the configurable threshold, and severity that grows
with time. What it deliberately does not do is remember anything across a
restart, or keep a history of past door events with evidence attached — those
need the event store, and the placeholders below mark where they attach.

A door's identity is the region an operator marked, and each frame's
detections are matched onto those regions by overlap — all of them at once,
because a door is one thing and two adjacent regions used to be able to claim
the same box and time it twice.

What a door is *believed* to be doing is a separate question with its own
file, `vision/door_state.py`: a state has to be argued for before it is
reported, whether it is replacing another one or arriving at a doorway nobody
has read yet, and a doorway that goes on contradicting itself is reported as
unreliable rather than committed to.

## How long this module takes to say anything, measured

An operator setting an allowance is setting the second half of a wait, and
the first half is not theirs to set. Both numbers are published in
`get_config()` and repeated here because they are the module's behaviour, not
a detail of the vote:

    a first sighting is not a state           0.8s minimum, by design
    confirmation on a clean 15 fps stream     0.80s, first belief or change
    confirmation on the reference footage     2.13s, first belief or change —
                                              still well over the constant,
                                              because the model finds a given
                                              doorway in about one frame in
                                              three and the vote is counted in
                                              sightings
    the floor under a per-door allowance      0.8s. An allowance below it
                                              raises its first alert at exactly
                                              the moment 0.8s would, because
                                              there is no duration to measure
                                              until the door is believed open

The first two rows are the same number for a door arriving and a door
changing, which is the point: a belief costs the same either way now.

None of that is a reason to lower the constants. It is a reason to say the
figures out loud where somebody typing "0.1" into a fire door's allowance can
read them.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import MODELS_DIR
from app.core.validate import fraction, positive
from app.vision.legibility import read
from app.modules.base import BaseMonitoringService
from app.vision.door_regions import (
    MAX_OPEN_SECONDS,
    MIN_DOOR_AREA,
    MIN_SIZE,
    door_regions,
)

# The belief rules, and the constants they are made of. Imported rather than
# reimplemented, and re-exported under the names they have always had here so
# that everything reading `door.service.STATE_CONFIRM_SECONDS` still can.
from app.vision.cadence import Cadence
from app.vision.door_state import (  # noqa: F401  (re-exported)
    CONFIRM_MAJORITY,
    MIN_CONFIRM_SIGHTINGS,
    SPLIT_FOR_SECONDS,
    STARVED_AFTER_SECONDS,
    STATE_CONFIRM_SECONDS,
    STATE_WINDOW_SECONDS,
    UNRELIABLE,
    observe as _observe_state,
    settle as _settle_state,
    starved as _starved,
)

MODEL_PATH = MODELS_DIR / "door.pt"

DEFAULT_CONFIDENCE = 0.40

#: Seconds a door may stay open before it is reported. The brief calls this
#: the 3-second rule; it is configurable because a loading bay and a fire door
#: do not deserve the same threshold. Bounded above by MAX_OPEN_SECONDS, which
#: lives in door_regions so the same ceiling binds a per-door override.
DEFAULT_OPEN_SECONDS = 3.0

#: Multiples of the threshold at which severity escalates.
ESCALATE_AT = (1.0, 4.0, 10.0)

#: MIN_DOOR_AREA — smallest believable door — now lives in door_regions,
#: beside the two constants it is arithmetically tied to: the marked region's
#: own minimum area is derived from it and from the matching overlap, and a
#: derivation split across two files goes stale the first time one of the
#: numbers is retuned. Imported above and used below exactly as before.
#:
#: There was a second overlap constant here too — MATCH_IOU = 0.30, "the same
#: door as last frame" — belonging to the tracker that gave automatically
#: found doors their identity between frames. That tracker went when the
#: module became marked-only, and the constant and its `_iou` helper stayed
#: behind, called by nothing and disagreeing with the live 0.25 in
#: door_regions. Two numbers for one apparent job is how DOOR-08 was read as a
#: three-way disagreement; there was only ever one rule.

#: How long a calibrated door may go unseen before its state is stale.
#:
#: A marked doorway cannot vanish, so when nothing overlaps it the last known
#: state is kept — a forklift parked in front of a closed door does not open
#: it. But a state nobody has confirmed for a while is a memory, not an
#: observation, and reporting "open for 45 minutes" about a door last actually
#: seen 44 minutes ago would be a lie with a timer on it. Past this the door
#: is shown as unconfirmed and stops escalating.
STALE_AFTER = 30.0

#: How long confirmation took on real footage, in seconds. Published, not used.
#:
#: `STATE_CONFIRM_SECONDS` is a floor and reads like a promise. On a clean
#: 15 fps stream the module matches it exactly — 0.80s. On the reference clip
#: the same door takes 2.13s from genuinely opening to being reported open,
#: and the same again to be believed open at all when it was already open
#: before anybody was watching. Well over the design constant, because the
#: vote is counted in sightings and the model only finds a given doorway in
#: about one frame in three.
#:
#: Nowhere an operator could see it, which is what made it a defect rather
#: than a fact. It goes out with the configuration now.
#:
#: It was 2.67s, and the number moved because the module stopped only ever
#: re-reading its evidence on frames where it had just seen the doorway. The
#: elapsed part of the bar now comes good on the frames between sightings, so
#: a door is believed as soon as its evidence is old enough rather than at the
#: next sighting after that. Nothing was loosened to buy it — the same three
#: sightings at the same majority — and this line exists because a published
#: figure that was true last week is precisely the defect DOOR-10 was.
CONFIRM_SECONDS_MEASURED = 2.13

#: The shortest allowance worth setting on a door, in seconds.
#:
#: A per-door allowance below this buys nothing: no door is reported open
#: until its sightings have argued for `STATE_CONFIRM_SECONDS`, and until it
#: is reported open there is no duration to compare an allowance against. So
#: "fire door: 0.1 seconds" and "fire door: 0.8 seconds" raise their first
#: alert at the same moment, and only the first of the two looks like it did
#: something.
#:
#: Not enforced. An operator who wants 0.1s can have it, and it will behave
#: exactly as 0.8s does; refusing the number would be a worse answer than
#: publishing what it means.
MIN_USEFUL_OPEN_SECONDS = STATE_CONFIRM_SECONDS

COLOR_CLOSED = (0, 170, 0)
COLOR_OPEN = (0, 170, 220)
COLOR_ALERT = (0, 0, 220)

#: Neither of the other three. A doorway the camera cannot read is not a
#: finding, and must not borrow the colour of one — least of all the green.
COLOR_UNSURE = (150, 150, 150)


class DoorService(BaseMonitoringService):
    """Watches doors and reports any left open beyond the allowed time."""

    module_id = "door"
    name = "Doors"
    description = "The AI watches every door and alerts when one is left open too long."

    def __init__(self) -> None:
        self._model = None
        self._load_failed = False
        self._confidence = DEFAULT_CONFIDENCE
        self._open_seconds = DEFAULT_OPEN_SECONDS

        # region_id -> {state, since, last_seen, history, ...}
        #
        # A marked doorway is never invented and never forgotten: it exists
        # because somebody drew it, and only its state is in question.
        self._watched: dict[int, dict[str, Any]] = {}

        # How fast frames are actually arriving. The vote below asks for
        # MIN_CONFIRM_SIGHTINGS inside STATE_WINDOW_SECONDS, which is a rate,
        # and over a tunnel to a hosted GPU the delivered rate can sit under
        # it — see app/vision/cadence.py. One per session: frames arrive at
        # one rate for the whole module, not per doorway.
        self._cadence = Cadence(STATE_WINDOW_SECONDS, MIN_CONFIRM_SIGHTINGS)

        # Set on a session copy. The operator's own camera is not a camera the
        # server can name, so its calibration is kept under one key rather
        # than under whatever the server happened to have open at the time.
        self._browser_camera = False

        super().__init__()

    # ------------------------------------------------------------------

    def _get_model(self):
        if self._model is not None or self._load_failed:
            return self._model

        if not MODEL_PATH.exists():
            self._load_failed = True
            print(f"[Door] No model at {MODEL_PATH}; module disabled.")
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(str(MODEL_PATH))
            print(f"[Door] Model loaded: {self._model.names}")
        except Exception as exc:  # noqa: BLE001
            self._load_failed = True
            print(f"[Door] Could not load model: {exc}")

        return self._model

    def model_loaded(self) -> bool:
        """Whether the door model itself is available."""
        return self._get_model() is not None

    def is_configured(self) -> bool:
        """Whether an operator has marked a doorway on the camera in use."""
        return door_regions.is_calibrated(self._source())

    def is_ready(self) -> bool:
        # Set up means a model *and* somewhere to point it. Reporting ready
        # with nothing marked would put a capability on the dashboard that
        # is watching nothing at all.
        #
        # Same answer as before, now said in terms of the two facts under it,
        # so the screen can tell a missing model from an empty setup instead of
        # telling every new deployment the door AI is not installed.
        return self.model_loaded() and self.is_configured()

    def reset(self) -> None:
        """
        Forget every door and its timer. Called when the source changes.

        The calibration itself is not touched: it is filed under the camera it
        was drawn on, so it simply stops applying until that camera comes
        back. Deleting it would mean losing real setup work to a preview of
        another camera.
        """
        super().reset()
        self._watched = {}
        self._cadence.reset()

    def reset_session_state(self) -> None:
        """
        Give this copy its own doors and id counter.

        Without this, two browsers pushing different cameras at this module
        share one door table: doors from one camera get matched by overlap
        against doors from the other, timers get reset by a state seen
        somewhere else entirely, and both threads mutate the same dict — which
        also races on the delete in _watch and the id increment below.
        """
        self._watched = {}
        self._cadence = Cadence(STATE_WINDOW_SECONDS, MIN_CONFIRM_SIGHTINGS)

        # Frames arriving over the socket come from the operator's own camera.
        self._browser_camera = True

    def _source(self):
        """Which camera's calibration applies to the frames being analysed."""
        if self._browser_camera:
            return "browser"

        # Imported here: app.camera reaches back into the vision package, and
        # taking the dependency at module scope closes the loop.
        from app.camera import camera_manager

        return camera_manager.current_source

    def _now(self) -> float:
        """
        Current time.

        Isolated so a test can replay recorded footage at the video's own
        timeline instead of wall-clock, which otherwise makes a 48-second clip
        analysed in 20 seconds report durations that never happened.
        """
        return time.time()

    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        model = self._get_model()

        if model is None:
            return frame, self._store(self.empty_result())

        now = self._now()

        # Before anything votes on this frame. The window every belief below
        # is measured against follows the rate frames actually arrive at.
        self._cadence.tick(now)

        results = model(frame, verbose=False, conf=self._confidence)

        height, width = frame.shape[:2]

        detections = []
        for result in results:
            for box in result.boxes:
                state = model.names[int(box.cls[0])]
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])

                # Too small to be a door anyone could walk through — a
                # fragment at the frame's edge, or something door-coloured.
                # Kept out of tracking entirely, or it gets an id and a
                # timer and eventually an alert.
                if (x2 - x1) * (y2 - y1) < MIN_DOOR_AREA * width * height:
                    continue

                detections.append(
                    {
                        "box": (x1, y1, x2, y2),
                        "state": state,
                        "conf": float(box.conf[0]),
                    }
                )

        marked = door_regions.for_source(self._source())

        if not marked:
            # Nothing is watched until somebody says what to watch. Left to
            # find doorways by itself the model boxed office partitions,
            # glazing and cupboard fronts and started timers on them — four
            # doors in a room with one. It is good at answering "is this
            # doorway open"; it was never good at "where are the doorways",
            # and the operator already knows.
            result = self.empty_result()
            result["summary"] = "No doors marked"
            return frame, self._store(result)

        # The doorways are the ones the operator drew, and the model is asked
        # only whether each is open. Anything it finds elsewhere is not a
        # door here.
        tracked = self._watch(marked, detections, now, width, height)

        annotated = self._annotate(frame, tracked, now)

        result = self._summarise(tracked, now, read(frame, self.module_id))
        result["regions"] = self._regions(tracked, now, width, height)
        result["calibrated"] = bool(marked)

        return annotated, self._store(result)

    def _watch(
        self,
        marked: list[dict[str, Any]],
        detections: list[dict[str, Any]],
        now: float,
        width: int,
        height: int,
    ) -> list[dict[str, Any]]:
        """
        Report on the doorways the operator marked, and nothing else.

        Marked doorways are the only doors there are — the automatic tracker
        this used to share its output shape with was removed when the module
        became marked-only — but the shape is kept, because the timers, the
        escalation, the annotation and the event keys all read it.

        The box reported is the marked region, never the detection. That is
        the point of calibrating: the rectangle on screen holds still, because
        it is the one that was drawn rather than one the model redraws every
        frame.
        """
        # Detections in the same units as the regions, which are fractions of
        # the picture so they survive a change of resolution.
        scaled = [
            {
                **detection,
                "box": [
                    detection["box"][0] / width,
                    detection["box"][1] / height,
                    detection["box"][2] / width,
                    detection["box"][3] / height,
                ],
            }
            for detection in detections
        ]

        # Every doorway matched at once, so no detection can be two doors.
        # This used to be asked one region at a time, inside the loop below,
        # and each answer was right on its own: a box sitting across the
        # boundary between two adjacent doorways clears the bar against both,
        # and both then reported the same state, from the same box, at the
        # same moment — two timers escalating in step off one physical door.
        assigned = door_regions.assign(
            [region["box"] for region in marked], scaled
        )
        claimed = set(assigned.values())

        watched = []

        for position, region in enumerate(marked):
            state = self._watched.get(region["id"])

            if state is None:
                state = {
                    # Unknown until the model has actually looked. Starting at
                    # "closed" would be an assumption presented as an
                    # observation, and on a safety system a confident wrong
                    # "closed" is the worst of the three answers.
                    "state": None,
                    "since": now,
                    "last_seen": None,
                    "conf": 0.0,
                    # Recent sightings, for the vote in _observe_state.
                    "history": [],
                    # Since when those sightings have been an even argument
                    # between open and closed, or None while they are not.
                    "split_since": None,
                    # How often this region has been seen to hold more than
                    # one doorway. Counted rather than latched on the first
                    # sighting, because believing a thing the moment it is
                    # first seen is the defect this module is named for.
                    "crowded": 0,
                }
                self._watched[region["id"]] = state

            index = assigned.get(position)

            if index is not None:
                self._apply_observation(state, scaled[index], now)
            elif not self.single_frame:
                # Not sighted this frame, which is not the same as nothing to
                # say. Two parts of the bar — the elapsed time since the first
                # supporting sighting, and how long the evidence has been an
                # even split — only ever come good between sightings, and were
                # previously read on sighting frames alone. A still is exempt:
                # there is no "between frames" in one photograph.
                _settle_state(state, now, window=self._cadence.window)

            # What else is in the box, beside whatever was matched. A marked
            # region can only ever report one doorway's state, so a region
            # drawn across two of them is watching one and ignoring the other
            # in silence — the operator sees a door being timed and no sign
            # that a second one is not.
            if door_regions.doorways_in(
                region["box"], scaled, ignore=claimed - {index}
            ) > 1:
                state["crowded"] = state.get("crowded", 0) + 1

            unseen_for = None if state["last_seen"] is None else now - state["last_seen"]
            stale = unseen_for is None or unseen_for > STALE_AFTER

            watched.append(
                {
                    "id": region["id"],
                    "name": region["name"],
                    # Back into pixels for the annotation and the overlay,
                    # which both work in the frame's own coordinates.
                    "box": (
                        region["box"][0] * width,
                        region["box"][1] * height,
                        region["box"][2] * width,
                        region["box"][3] * height,
                    ),
                    "state": state["state"],
                    "conf": state["conf"],
                    "since": state["since"],
                    "last_seen": state["last_seen"] or now,
                    "seen_now": index is not None,
                    "stale": stale,
                    "calibrated": True,
                    "open_seconds": region.get("open_seconds") or self._open_seconds,
                    # Believed on the same terms as a change of state: several
                    # sightings, not one. A doorway does not move and a marked
                    # box does not either, so the count is not aged out — the
                    # model simply cannot see either door on every frame, and
                    # a warning that flickered with the detector would be
                    # noise rather than a warning. Editing the region clears
                    # it, along with the rest of that region's memory.
                    "crowded": state.get("crowded", 0) >= MIN_CONFIRM_SIGHTINGS,
                    # Sighted over and over and still never settling, as
                    # against never sighted at all. Both leave `state` None
                    # and neither escalates; they are simply not the same
                    # thing to be told.
                    "starved": _starved(state, now),
                }
            )

        # Anything still remembered for a region that has since been deleted.
        live = {region["id"] for region in marked}
        for gone in [key for key in self._watched if key not in live]:
            self._watched.pop(gone, None)

        return watched

    def _apply_observation(
        self, state: dict[str, Any], detection: dict[str, Any], now: float
    ) -> None:
        """
        Fold one sighting of a marked-out door into its remembered state.

        `single_frame` is passed through because an uploaded photograph has no
        second frame to confirm anything with, and a confirmation bar meant
        for a stream turns "what does this picture show" into "not seen yet"
        for ever. The base class already draws that distinction for the
        modules that settle verdicts over time; this one now needs it too.
        """
        state["conf"] = detection["conf"]
        state["last_seen"] = now

        _observe_state(
            state,
            detection["state"],
            now,
            self.single_frame,
            window=self._cadence.window,
        )

    def _regions(self, tracked, now, width, height) -> list[dict[str, Any]]:
        """Each door with how long it has been in its current state."""
        regions = []

        for door in tracked:
            name = door.get("name") or ""

            if door["state"] is None and door.get("starved"):
                # Looked at, repeatedly, and still not settling. Warning rather
                # than muted for the same reason as unreliable below: this is
                # not a doorway waiting its turn, it is one the operator needs
                # to do something about — move the box, or accept that this
                # doorway cannot be watched from this camera.
                tone = "warning"
                label = (
                    f"{name} — seen too rarely to judge"
                    if name
                    else "Seen too rarely to judge"
                )
            elif door["state"] is None:
                # Marked, but the model has not managed to look at it yet.
                tone = "muted"
                label = f"{name} — not seen yet" if name else "Not seen yet"
            elif door["state"] == UNRELIABLE:
                # Not open, not closed, and deliberately neither of their
                # tones: the camera is contradicting itself about this
                # doorway, which is a marking or a viewing problem and not a
                # door problem. Warning rather than muted, because unlike a
                # doorway nobody has looked at yet, this one has been looked
                # at repeatedly and is still not being answered.
                tone = "warning"
                label = (
                    f"{name} — cannot tell if open or closed"
                    if name
                    else "Cannot tell if open or closed"
                )
            elif door["state"] == "open":
                open_for = round(now - door["since"], 1)
                overdue = self._severity(open_for, door.get("open_seconds")) is not None

                # A door nobody has confirmed for a while is a memory, not an
                # observation, so it is shown as such and never in alarm red.
                if door.get("stale"):
                    tone = "warning"
                    label = f"{name} — open, unconfirmed" if name else "Open, unconfirmed"
                else:
                    tone = "danger" if overdue else "warning"
                    opened = f"open {self._describe(open_for)}"
                    label = f"{name} — {opened}" if name else f"Open {self._describe(open_for)}"
            else:
                tone = "muted" if door.get("stale") else "ok"
                suffix = "closed, unconfirmed" if door.get("stale") else "closed"
                label = f"{name} — {suffix}" if name else suffix.capitalize()

            if door.get("crowded"):
                # Said on the box itself, which is the only place the operator
                # can see which box it is about. Whatever state is reported
                # here belongs to one of the doorways inside it and the other
                # is not being watched at all — so a plain green "closed" is
                # withdrawn: it is the reassuring answer given about the case
                # the module knows least.
                label = f"{label} · 2 doorways in this box"
                tone = "warning" if tone in ("ok", "muted") else tone

            regions.append(
                self.region(
                    door["box"], width, height,
                    label=label, tone=tone, id=door["id"],
                )
            )

        return regions

    # ------------------------------------------------------------------
    # Tracking and timing
    # ------------------------------------------------------------------

    def _severity(self, seconds: float, threshold: Optional[float] = None) -> Optional[str]:
        """How serious a door open for this long is, or None if within limits."""
        threshold = threshold or self._open_seconds

        # An allowance that is not a real number inside the permitted range is
        # ignored, and the module's own default used instead. Configuration is
        # checked on the way in now, so nothing an operator sends can arrive
        # here — but a hand-edited regions file on disk still can, and this is
        # the line it would arrive at. Written as a range test rather than a
        # finiteness one because that is what has to hold anyway, and because
        # `seconds < threshold` below is False against NaN: a NaN allowance
        # used to sail past it, past both escalation bounds, and return "low"
        # for a door that had been open for a tenth of a second.
        #
        # Falling back rather than refusing to judge: a door with an unusable
        # allowance should still be watched on the module's terms. Trusting
        # the number switched the alert permanently on; refusing to judge
        # would switch it permanently off, which is the quieter of the two
        # wrong answers and therefore the more dangerous one.
        if not 0 < threshold <= MAX_OPEN_SECONDS:
            threshold = self._open_seconds

        if seconds < threshold:
            return None

        ratio = seconds / threshold

        if ratio >= ESCALATE_AT[2]:
            return "high"
        if ratio >= ESCALATE_AT[1]:
            return "medium"
        return "low"

    # ------------------------------------------------------------------

    def _summarise(
        self,
        tracked: list[dict[str, Any]],
        now: float,
        reading: Any = None,
    ) -> dict[str, Any]:
        doors = []
        overdue = []

        unknown = 0
        starved = 0
        unreliable = 0
        crowded = 0

        for door in tracked:
            is_open = door["state"] == "open"

            # Rounded first, and judged on the rounded figure. Severity used
            # to be computed from the raw duration while the rounded one was
            # printed beside it, so an operator read `open_seconds: 1.0` next
            # to `severity: "medium"` off a real 0.96 seconds — a row that
            # cannot be checked by looking at it, and the one row anybody
            # would check.
            open_for = round(now - door["since"], 1) if is_open else 0.0

            # A state nobody has confirmed lately does not escalate. It is
            # still reported, still visible, and still open on the screen —
            # it simply stops driving an alarm on the strength of a memory.
            severity = (
                self._severity(open_for, door.get("open_seconds"))
                if is_open and not door.get("stale")
                else None
            )

            if door["state"] is None:
                unknown += 1

                if door.get("starved"):
                    starved += 1

            if door["state"] == UNRELIABLE:
                unreliable += 1

            if door.get("crowded"):
                crowded += 1

            entry = {
                "id": door["id"],
                "name": door.get("name") or "",
                "state": door["state"],
                "open_seconds": open_for,
                "severity": severity,
                "stale": bool(door.get("stale")),
                "seen_now": bool(door.get("seen_now")),
                "threshold_seconds": door.get("open_seconds") or self._open_seconds,
                # Whatever this row says is about one of the doorways in that
                # box. Carried per door as well as counted below, so a reader
                # of a single row knows how much of a doorway it describes.
                "crowded": bool(door.get("crowded")),
                # Unconfirmed because the sightings never arrive close enough
                # together, not because none has arrived. `state` is still
                # None either way — this only tells the row which sentence is
                # true of it.
                "starved": bool(door.get("starved")),
            }
            doors.append(entry)

            if severity:
                overdue.append(entry)

        open_count = len([d for d in doors if d["state"] == "open"])

        if not doors:
            summary = "No doors in view"
        elif overdue:
            longest = max(overdue, key=lambda d: d["open_seconds"])
            which = longest["name"] or "Door"
            summary = (
                f"{which} open for {self._describe(longest['open_seconds'])}"
                if len(overdue) == 1
                else f"{len(overdue)} doors left open"
            )
        elif open_count:
            summary = (
                "1 door open" if open_count == 1 else f"{open_count} doors open"
            )
        elif unknown or unreliable:
            # A marked doorway the model has never once found is not a closed
            # door, and neither is one it keeps changing its mind about.
            # Saying "All doors closed" here put the module's most reassuring
            # line on the screen for the cases it knows least about — and this
            # module's own rule elsewhere is that a confident wrong "closed"
            # is the worst of the three answers.
            #
            # The mixed case is named in full rather than rounded off to the
            # good news, because the parts need different actions: the closed
            # ones are settled, the unconfirmed ones mean the doorway is not
            # being found at all, and the unreliable ones mean it is being
            # found and read both ways. Two of the three want somebody to look
            # at the marking or the camera; only one of them is done with.
            confirmed = len(doors) - unknown - unreliable

            parts = []

            if confirmed:
                parts.append(self._count(confirmed, "closed", not parts))
            if unreliable:
                parts.append(self._count(unreliable, "unreliable", not parts))
            if unknown:
                parts.append(self._count(unknown, "unconfirmed", not parts))

            summary = ", ".join(parts)

            # A word like "unconfirmed" on its own is a status, not an
            # instruction. When it is the whole of the news it gets the clause
            # that says what to do about it; alongside other counts it does
            # not, because the sentence is read aloud and has to stay one.
            if not confirmed and not unreliable:
                # "Not seen yet" invites waiting, and waiting is the one thing
                # that will not help a doorway the model has already been
                # sighting for four windows without ever settling. Only said
                # when every unconfirmed doorway is in that position; a mix
                # still reads as the milder sentence, because the operator's
                # next move there is to give the other ones their moment.
                summary = (
                    f"{summary} — seen too rarely to judge"
                    if starved == unknown
                    else f"{summary} — not seen yet"
                )
            elif not confirmed and not unknown:
                summary = (
                    f"{summary} — the camera cannot tell if it is open"
                    if unreliable == 1
                    else f"{summary} — the camera cannot tell if they are open"
                )
        else:
            summary = "All doors closed"

        # A box with two doorways in it is a marking problem, not a door
        # state, so it is added to whatever the doors are doing rather than
        # replacing it — and only while nothing is overdue, because the
        # headline during an alert belongs to the alert, and this sentence is
        # also the one the voice reads out. It is on the box itself and in
        # the door's own row either way.
        if crowded and not overdue:
            summary = (
                f"{summary} — 1 marked box has 2 doorways in it"
                if crowded == 1
                else f"{summary} — {crowded} marked boxes have 2 doorways in them"
            )

        worst = None
        if overdue:
            order = {"low": 1, "medium": 2, "high": 3}
            worst = max(overdue, key=lambda d: order[d["severity"]])["severity"]

        # A doorway nobody can see is not a doorway anybody has checked. This
        # module judges no people, so `people_unverified` stays zero — but the
        # picture can be as unreadable here as anywhere, and "All doors
        # closed" said of a picture too dark to read is the same confident
        # wrong answer in a different capability.
        unreadable = reading is not None and not reading.readable

        return {
            "alert": bool(overdue) and not unreadable,
            "status": (
                "alert" if overdue and not unreadable
                else "unverified" if unreadable
                else "clear" if doors
                else "idle"
            ),
            "summary": reading.reason if unreadable else summary,
            **self.uncertainty(reading),
            "detections": doors,
            "doors_total": len(doors),
            "doors_open": open_count,
            # Confirmed closed, not "everything that isn't open". A door the
            # model has never found is neither, nor is one it cannot read, and
            # counting either here would have this number contradict the
            # summary above it in the same breath. Both have their own count
            # below.
            "doors_closed": len(doors) - open_count - unknown - unreliable,
            "doors_overdue": len(overdue),
            "doors_unknown": unknown,
            # Marked doorways whose sightings are an even argument between
            # open and closed. Not an alert and not an answer: the camera
            # cannot read that doorway, which is a different problem from a
            # door being open and wants a different person.
            "doors_unreliable": unreliable,
            # Marked boxes with more than one doorway in them. Only ever one
            # of those doorways is being watched; the rest could stand open
            # all day inside a region reporting "closed", which is what this
            # module did in silence.
            "doors_crowded": crowded,
            "longest_open_seconds": max(
                (d["open_seconds"] for d in doors), default=0.0
            ),
            "severity": worst,
            "threshold_seconds": self._open_seconds,
            "violations": len(overdue),
        }

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        One event per door left open, escalating as it stays open.

        The record keeps where the door was, not only which tracking number it
        was given. Those numbers are assigned in the order doors come into
        view and mean nothing between sessions — "Door 2" tomorrow is not
        "Door 2" today. Until doors can be named on a site plan, the position
        in the picture is the only thing in the record that will still
        identify the door next week.
        """
        boxes = {
            region["id"]: region["box"]
            for region in result.get("regions", [])
            if region.get("id") is not None and region.get("box")
        }

        calibrated = result.get("calibrated")

        found = []

        for door in result.get("detections", []):
            if not door.get("severity"):
                continue

            where = boxes.get(door["id"])
            name = door.get("name") or ""

            found.append(
                {
                    # A calibrated door's id is the region an operator drew,
                    # so it means the same thing next week. An automatic
                    # door's is a tracking number that restarts every session,
                    # so its position stands in for a name — quantised, so the
                    # same doorway produces the same key each time rather than
                    # a new one every time a box wanders a pixel.
                    "key": (
                        f"door-{door['id']}-open"
                        if calibrated
                        else f"door-at-{self._where_key(where)}-open"
                    ),
                    "severity": door["severity"],
                    "summary": (
                        f"{name} left open for {self._describe(door['open_seconds'])}"
                        if name
                        else f"Door left open for {self._describe(door['open_seconds'])}"
                    ),
                    "details": {
                        "door": name or door["id"],
                        "calibrated": bool(calibrated),
                        "open_seconds": door["open_seconds"],
                        "threshold_seconds": door.get("threshold_seconds"),
                        # Fractions of the picture, so this still points at the
                        # same doorway whatever size the camera runs at.
                        "where": where,
                    },
                }
            )

        return found

    @staticmethod
    def _where_key(box) -> str:
        """
        A door's position, coarse enough to be the same key twice.

        Rounded to twentieths of the picture: a detection box drifts by a few
        pixels between sightings, and keying on the raw position would open a
        fresh event every time it did.
        """
        if not box:
            return "unknown"

        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2

        return f"{round(cx * 20) / 20:.2f}x{round(cy * 20) / 20:.2f}"

    @staticmethod
    def _count(number: int, word: str, first: bool) -> str:
        """
        One count in the summary's list — "1 door closed, 2 unconfirmed".

        Only the first item carries the noun, because the sentence is spoken
        aloud as well as read and "1 door closed, 2 doors unconfirmed" is a
        mouthful of the same word. Singular and plural are decided by the
        count that item is about, not by the total.
        """
        noun = f"{'door' if number == 1 else 'doors'} " if first else ""

        return f"{number} {noun}{word}"

    @staticmethod
    def _describe(seconds: float) -> str:
        """Duration in words an operator reads at a glance."""
        if seconds < 60:
            whole = int(seconds)
            return f"{whole} second" if whole == 1 else f"{whole} seconds"
        if seconds < 3600:
            return f"{int(seconds // 60)} min {int(seconds % 60)} sec"
        return f"{int(seconds // 3600)} hr {int((seconds % 3600) // 60)} min"

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                # A weights file on disk is not a model that loaded. Corrupt
                # weights, a torch/ultralytics mismatch and an OOM at load time
                # all leave the file exactly where it was, and this line used
                # to report every one of them as a healthy camera with nothing
                # in front of it.
                #
                # Asked of what the module actually knows, not of the disk. It
                # deliberately does not force a load to find out: this runs at
                # construction and on every session copy, and loading here
                # would have every module pull its weights into memory at
                # startup whether or not anybody ever watches it. Before the
                # first frame the honest answer is the ordinary one.
                "summary": (
                    "Door monitoring is not available"
                    if self._load_failed
                    else "No doors in view"
                ),
                "doors_total": 0,
                "doors_open": 0,
                "doors_closed": 0,
                "doors_overdue": 0,
                "doors_unknown": 0,
                "doors_unreliable": 0,
                "doors_crowded": 0,
                "longest_open_seconds": 0.0,
                "severity": None,
                "threshold_seconds": self._open_seconds,
                "violations": 0,
            }
        )
        return result

    def get_results(self) -> dict[str, Any]:
        """
        The latest analysis, or a placeholder built now if there has not been one.

        The placeholder is rebuilt rather than served from the copy made at
        construction. `empty_result()` above reports whether the model failed
        to load, and at construction nothing has tried to load it yet — so a
        corrupt `door.pt` answered "No doors in view" to every request made
        before the first frame arrived, which is the reassuring answer for the
        one case that most needs the other one.

        Still nothing here forces a load. If nobody has asked for the model
        yet, the ordinary answer is the honest one. But the module list polls
        `model_loaded()` on every refresh, and the Doors page reads status
        before it reads results, so by the time anyone is looking a load has
        been attempted and its outcome is on file — this simply stops that
        outcome being hidden behind a sentence written before it was known.
        """
        if self._updated_at == float("-inf"):
            return self.empty_result()

        return self._last_result

    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        """
        Everything the settings screen needs to set an allowance honestly.

        Including what the allowance cannot do. A door is not reported open
        until its sightings have argued for `STATE_CONFIRM_SECONDS`, so that
        wait is added to whatever is set here — and an allowance shorter than
        it changes nothing at all, because there is no duration to compare
        against until the door is believed open. That floor was real, was
        never written down anywhere near the field that sets it, and made
        "fire door: 0.1 seconds" look like an instruction the module had
        obeyed.

        `confirm_seconds_measured` is the same wait on real footage rather
        than in principle: the reference clip's model finds a given doorway in
        about one frame in three, and the vote is counted in sightings, so
        confirmation there takes 2.13s against a design constant of 0.8.
        """
        return {
            "open_seconds": self._open_seconds,
            "open_seconds_default": DEFAULT_OPEN_SECONDS,
            "confidence": self._confidence,
            "doors": door_regions.for_source(self._source()),
            "calibrated": door_regions.is_calibrated(self._source()),
            # How long the module takes before an allowance starts counting,
            # by design and as measured. Published because an operator setting
            # a threshold is setting the second half of a wait and had no way
            # to find out about the first half.
            "confirm_seconds": STATE_CONFIRM_SECONDS,
            "confirm_seconds_measured": CONFIRM_SECONDS_MEASURED,
            "min_useful_open_seconds": MIN_USEFUL_OPEN_SECONDS,
            "timing_note": (
                f"A doorway is not reported open until about "
                f"{STATE_CONFIRM_SECONDS:g}s of agreeing sightings — "
                f"{CONFIRM_SECONDS_MEASURED:g}s on the reference footage, "
                "where the camera only finds a given door in some frames. "
                "That wait comes before the allowance below, so an allowance "
                f"under {MIN_USEFUL_OPEN_SECONDS:g}s raises its first alert at "
                f"the same moment {MIN_USEFUL_OPEN_SECONDS:g}s would."
            ),
            # Published so the drawing canvas can refuse a box this module
            # would refuse, at the moment it is drawn rather than after a
            # round trip. The canvas used to carry its own copy of the floor
            # and claim in a comment that it matched; adding an area rule here
            # made that claim false, which is how a fifth copy of a constant
            # becomes a bug rather than a nuisance.
            "min_side": MIN_SIZE,
            "min_area": door_regions.MIN_AREA,
            "max_open_seconds": MAX_OPEN_SECONDS,
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Set how long a door may stay open, and detection sensitivity.

        Args:
            payload: any of ``{"open_seconds": > 0, "confidence": 0.0-1.0}``,
                or a calibration action — see `_calibrate`.

        `open_seconds` is counted from the moment the door is *believed* open,
        not from the frame the model first said so, so the module's own
        confirmation wait — `STATE_CONFIRM_SECONDS`, and `2.13s` measured on
        real footage — is added to it. Anything under
        `MIN_USEFUL_OPEN_SECONDS` therefore alerts no sooner than that value
        would; the number is accepted rather than refused, and published in
        `get_config()` so it can be seen where it is set.
        """
        if "door" in payload:
            return self._calibrate(payload["door"])

        changed = {}

        # Checked by the shared validator rather than by another hand-rolled
        # `float()` and `<= 0`. That pair was wrong in the same way in every
        # module: `value <= 0` is False for NaN and for infinity, so both were
        # accepted as a grace period, and a NaN one made every comparison in
        # `_severity()` False — so it fell past the "not overdue" return, past
        # both escalation bounds, and reported "low" the instant any door
        # opened, whatever its duration. There was no upper bound either, so
        # 999999 seconds — eleven days — was a way of switching the alert off
        # while the module went on reporting itself ready.
        if "open_seconds" in payload:
            value = positive(
                payload["open_seconds"], "open_seconds", maximum=MAX_OPEN_SECONDS
            )

            self._open_seconds = value
            changed["open_seconds"] = value

        if "confidence" in payload:
            value = fraction(payload["confidence"], "confidence")

            self._confidence = value
            changed["confidence"] = value

        if not changed:
            # ValueError, like every other refusal in this file. KeyError puts
            # quotes round its own message when it is turned into a string, and
            # the HTTP layer passes that string through untouched — so the
            # operator was shown 'open_seconds or confidence is required',
            # apostrophes and all, as though the server were quoting somebody.
            raise ValueError("open_seconds or confidence is required")

        return {"success": True, "message": "Settings updated.", **changed}

    def _calibrate(self, action: dict[str, Any]) -> dict[str, Any]:
        """
        Mark, adjust or forget a doorway on the camera being watched.

        Args:
            action: ``{"add": {"box": [...], "name": ..., "open_seconds": ...}}``
                or ``{"update": {"id": n, ...}}``
                or ``{"remove": n}``
                or ``{"clear": true}``.

        Boxes are fractions of the picture, so a calibration made at one
        resolution still lands correctly at another.

        Once anything is marked, the module watches only what was marked. That
        is the point of calibrating — a doorway stays where it was put, and a
        dark rectangle elsewhere that the model calls a door is not one here.
        """
        source = self._source()

        # Which door's remembered state this edit invalidates. Stays None for
        # an add: a brand-new id has never had an entry, so there is nothing
        # of its own to forget and nothing of anybody else's to touch.
        touched: Optional[int] = None
        forget_all = False

        if "add" in action:
            spec = action["add"] or {}
            door = door_regions.add(
                source,
                spec.get("box"),
                spec.get("name", ""),
                spec.get("open_seconds"),
            )
            message = f"Marked \"{door['name']}\"." if door["name"] else "Door marked."

        elif "update" in action:
            spec = dict(action["update"] or {})
            door_id = spec.pop("id", None)

            if door_id is None:
                raise ValueError("Which door to change is required.")

            door = door_regions.update(source, int(door_id), spec)
            touched = int(door_id)
            message = "Door updated."

        elif "remove" in action:
            door_id = int(action["remove"])

            if not door_regions.remove(source, door_id):
                raise ValueError("That door is not marked on this camera.")

            door = None
            touched = door_id
            message = "Door removed."

        elif action.get("clear"):
            removed = door_regions.clear(source)
            door = None
            forget_all = True
            message = (
                f"Cleared {removed} marked door(s). Nothing is watched until "
                "a doorway is marked again."
            )

        else:
            raise ValueError("add, update, remove or clear is required.")

        # The remembered state belongs to the shape that was just changed, so
        # a moved or deleted door starts again rather than carrying a timer
        # from the doorway it used to cover.
        #
        # Only that shape. This line used to empty the whole table on every
        # add, update, remove and clear alike, which meant marking a second
        # doorway anywhere in the frame dropped a live "open 14 seconds,
        # severity medium" on the first one back to 0.0 seconds and no
        # severity — routine setup work on one doorway silently erasing an
        # escalating alert on another, with nothing on screen to say it had
        # happened. The comment above it described the per-door behaviour all
        # along; it was the code that was wrong.
        if forget_all:
            # Nothing is marked any more, so there is nothing left to remember.
            self._watched = {}
        elif touched is not None:
            self._watched.pop(touched, None)

        return {
            "success": True,
            "message": message,
            "door": door,
            "doors": door_regions.for_source(source),
            "calibrated": door_regions.is_calibrated(source),
        }

    # ------------------------------------------------------------------

    def _annotate(
        self, frame: np.ndarray, tracked: list[dict[str, Any]], now: float
    ) -> np.ndarray:
        annotated = frame.copy()

        for door in tracked:
            x1, y1, x2, y2 = (int(v) for v in door["box"])

            if door["state"] == "open":
                # The same rounded duration the row carries, judged against
                # this door's own allowance rather than the module default —
                # a doorway with a ten-second grace period used to be drawn in
                # alarm red at three while its own row said nothing was wrong.
                open_for = round(now - door["since"], 1)
                overdue = (
                    self._severity(open_for, door.get("open_seconds")) is not None
                )
                colour = COLOR_ALERT if overdue else COLOR_OPEN
                label = f"Open {self._describe(open_for)}"
            elif door["state"] == UNRELIABLE:
                colour = COLOR_UNSURE
                label = "Cannot tell"
            elif door["state"] is None:
                # Never seen, and so not green. This is the picture the
                # server-side camera path draws, and painting a confident
                # "Closed" over a doorway the module has never managed to look
                # at is the same wrong answer the summary line above stopped
                # giving.
                colour = COLOR_UNSURE
                label = "Not seen yet"
            else:
                colour = COLOR_CLOSED
                label = "Closed"

            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)

            (tw, th), _ = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
            )
            top = max(y1 - th - 10, 0)

            cv2.rectangle(
                annotated, (x1, top), (x1 + tw + 10, top + th + 10), colour, -1
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 5, top + th + 3),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (255, 255, 255),
                2,
            )

        return annotated


service = DoorService()
