"""
Suspended load detection.

The hazard this capability exists for is a worker standing under a load that
is hanging from a lifting machine. Reaching that verdict honestly needs four
things — a load, proof it is attached to the lifter, proof the lifter is
raised, and a worker underneath — and only the last of those is answerable
today. This phase ships that last one and says plainly that the rest are not
yet known.

## What this phase does, and what it does not

An operator marks the floor the lifting machine works over. While somebody is
standing in it, the module says so. That is a real hazard signal on its own —
the bay's own signage says SUSPENDED LOADS — but it is *not* the
worker-under-suspended-load verdict, and the page must not read as though it
were. Every load-dependent field is reported as ``None`` with a reason, never
as ``False``: "no load detected" and "load detection is not built yet" are
different claims and only one of them is true.

## The person detector, and why it is not the shared one

Measured on the operator's own manipulator-bay footage (848x480, twelve
frames sampled across 36 seconds), the shared `yolov8n-seg` used by the
restricted zone and the workstation modules loses workers outright:

    model        conf | people found across 12 sampled frames | total
    yolov8n      0.45 | 2 2 2 2 1 0 2 2 1 0 0 0              |  14
    yolov8n      0.25 | 2 2 2 3 1 1 2 2 1 3 2 1              |  22
    yolov8s      0.45 | 2 2 2 2 1 1 2 1 1 2 2 1              |  19
    yolov8m      0.45 | 2 2 2 3 2 1 2 2 1 3 3 1              |  24
    yolov8m      0.25 | 2 2 2 3 2 1 2 2 1 3 3 1              |  24

Three consecutive samples where the shipped configuration found *nobody* in
a frame containing three people, verified by eye at 0.80, 0.53 and 0.77.

Two things follow. The picture is not the problem — the same frames measure
brightness 124, contrast 65 and sharpness 6900 against floors of 45, 21 and
22, so `legibility` correctly calls them readable and cannot save us here.
And lowering the shared detector's bar is the wrong repair: at 0.25 it
reaches a similar count, but it buys that recall by believing weaker evidence
from a weaker model. `yolov8m-seg` returns the *same* answer at 0.45, 0.35
and 0.25 — its detections sit clear of the threshold rather than straddling
it — so this module carries its own weights and leaves the shared detector,
and the four modules that depend on it, exactly as they are.

What that does not fix: even `yolov8m` misses a worker standing by the jib
arm in one of those frames. Recall is much improved and is not complete, and
this module's alarm is bounded by it.

## The marked area

Its own shape, in its own file, for the reason the vehicle zone and the
walkway each have theirs: the floor a machine swings over is frequently the
exact floor people are told to keep off, and sharing a polygon with either
would make marking one silently re-aim the other.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.config import MODELS_DIR, STORAGE_DIR
from app.core.validate import fraction
from app.modules.base import BaseMonitoringService
from app.vision.cadence import Cadence
from app.vision.legibility import read
from app.vision.polygon import PolygonManager

#: Reused rather than copied, so the band logic cannot drift between this
#: module and the restricted zone. `_grounded_share` is private to that file
#: and is imported deliberately: it carries a measured derivation (a real
#: footprint zone scoring 0.099-0.298 across 28 people) that a second
#: implementation here would quietly lose.
from app.vision.detector import (  # noqa: F401
    LOWER_OVERLAP_THRESHOLD,
    SCALE_RATIO,
    _grounded_share,
)

#: Stock COCO segmentation weights, medium. Not trained for this site — see
#: the module docstring for what was measured and what it costs.
MODEL_PATH = MODELS_DIR / "yolov8m-seg.pt"

#: The confidence a person has to reach to be counted.
#:
#: The ordinary bar, deliberately. These weights answer the same at 0.45,
#: 0.35 and 0.25 on the reference footage, so there is nothing to buy by
#: lowering it and a weaker model's habits to inherit if we did.
PERSON_CONFIDENCE = 0.45

#: The area a marked shape must cover before the scale guard can use it.
#:
#: Below a handful of pixels the ratio below is arithmetic on noise, so the
#: guard abstains rather than rejecting somebody on it.
MIN_ZONE_PIXELS = 64

#: How many agreeing sightings before the alarm, and over what window.
#:
#: The flicker bar and only the flicker bar, on the same reasoning as the
#: vehicle zone: one frame that mistakes something for a person must not
#: raise an alarm, and a hundred consecutive frames that do so still will.
#: Two rather than three, because a worker already standing under a machine
#: is not a verdict to be argued into slowly.
CONFIRM_SIGHTINGS = 2
CONFIRM_WINDOW_SECONDS = 1.5

#: How long the alarm holds after the last confirmed sighting.
#:
#: The detector drops a person for a frame or two at a time — measured above,
#: on this very footage. Without this the alarm stutters while somebody stands
#: exactly where they should not, which reads as a fault in the system rather
#: than a fact about the floor.
HOLD_SECONDS = 2.0

COLOR_ALERT = (0, 0, 220)
COLOR_CLEAR = (0, 170, 0)

#: Its own shape, its own file. See the module docstring.
suspended_load_manager = PolygonManager(
    STORAGE_DIR / "suspended_load_zone.json",
    noun="lifting area",
)

#: What the load-dependent half of the answer is, until it is built.
#:
#: Reported as None and not False. A page that renders False here would be
#: telling an operator there is no load hanging, which this phase has no way
#: of knowing.
UNBUILT_REASON = (
    "Load detection is not built yet — this page reports who is in the "
    "lifting area, not whether anything is hanging."
)


class SuspendedLoadService(BaseMonitoringService):
    """Who is standing in the floor a lifting machine works over."""

    module_id = "suspended-load"
    name = "Suspended load detection"
    description = "Alerts when somebody is in the area a lifting machine works over."

    def __init__(self) -> None:
        # Set before super().__init__(), which builds the first result and
        # therefore reads these. Ordered the other way round the module fails
        # to import at all, taking every other module's routes with it.
        self._model = None
        self._load_failed = False

        self._confidence = PERSON_CONFIDENCE

        super().__init__()

        self._votes: list[tuple[float, bool]] = []
        self._last_inside: float = float("-inf")
        self._last_seen_inside: list[dict[str, Any]] = []

        self._cadence = Cadence(CONFIRM_WINDOW_SECONDS, CONFIRM_SIGHTINGS)

    # ------------------------------------------------------------------

    def reset_session_state(self) -> None:
        """
        Rebuild everything mutable on a session copy.

        A new `Cadence` rather than a reset one: `for_session()` copies
        shallowly, so until this is replaced the copy would be measuring the
        origin's frames as well as its own.
        """
        self._votes = []
        self._last_inside = float("-inf")
        self._last_seen_inside = []
        self._cadence = Cadence(CONFIRM_WINDOW_SECONDS, CONFIRM_SIGHTINGS)

    def reset(self) -> None:
        """The camera changed; nothing measured on the old one still applies."""
        super().reset()
        self._votes = []
        self._last_inside = float("-inf")
        self._last_seen_inside = []
        self._cadence.reset()

    @staticmethod
    def _now() -> float:
        """Indirected so the suites can drive the clock."""
        return time.time()

    def _get_model(self):
        """
        The person weights, loaded once, on first use.

        Deferred so the backend starts and every other module keeps working
        when these weights are not installed, and latched so a missing file
        is reported once rather than retried on every frame.
        """
        if self._model is not None or self._load_failed:
            return self._model

        try:
            from ultralytics import YOLO

            if not MODEL_PATH.exists():
                print(
                    f"[SuspendedLoad] No model at {MODEL_PATH}; module disabled."
                )
                self._load_failed = True
                return None

            self._model = YOLO(str(MODEL_PATH))
            print("[SuspendedLoad] Person model loaded.")
        except Exception as exc:  # noqa: BLE001
            print(f"[SuspendedLoad] Could not load {MODEL_PATH}: {exc}")
            self._load_failed = True
            self._model = None

        return self._model

    def is_ready(self) -> bool:
        return self._get_model() is not None

    def model_loaded(self) -> bool:
        return self._get_model() is not None

    def is_configured(self) -> bool:
        return bool(suspended_load_manager.as_points())

    # ------------------------------------------------------------------

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        model = self._get_model()

        if model is None:
            return frame, self._store(self.empty_result())

        now = self._now()
        self._cadence.tick(now)

        height, width = frame.shape[:2]

        # Asked before any conclusion, so an unreadable picture cannot
        # produce a confident "nobody in the area".
        reading = read(frame, self.module_id)

        area = suspended_load_manager.points_for(width, height)

        if area is None:
            # No reading is attached, and that is deliberate. With nothing
            # marked this module is not judging the picture at all, so it
            # makes no claim about whether it could — "No lifting area
            # marked" stays true however dark the room. Attaching the
            # reading here reported `readable: false` beside `status:
            # "idle"`, which is the one combination Phase 3 forbids: a
            # module that cannot see must say unverified, and a module
            # that is not looking must not say it cannot see.
            result = self.empty_result()
            result["status"] = "idle"
            result["summary"] = "No lifting area marked"
            result["area_configured"] = False
            return frame, self._store(result)

        polygon_mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(polygon_mask, [np.array(area, dtype=np.int32)], 255)
        zone_pixels = int(cv2.countNonZero(polygon_mask))

        people = self._people(model, frame, polygon_mask, zone_pixels)

        inside = [p for p in people if p["inside"]]

        seen_inside = bool(inside) and reading.readable
        confirmed = self._confirmed(seen_inside, now)

        if confirmed:
            self._last_inside = now
            self._last_seen_inside = inside

        holding = now - self._last_inside <= HOLD_SECONDS
        alert = holding and reading.readable

        showing = inside if inside else (self._last_seen_inside if holding else [])
        stale = holding and not inside

        annotated = self._annotate(frame, people, area, alert)

        result = self._summarise(
            people, showing, stale, alert, reading, area, width, height
        )

        return annotated, self._store(result)

    # ------------------------------------------------------------------

    def _people(
        self,
        model,
        frame: np.ndarray,
        polygon_mask: np.ndarray,
        zone_pixels: int,
    ) -> list[dict[str, Any]]:
        """
        Everybody the detector found, and whether each is in the area.

        Standing in a patch of floor is a question about the lower body — the
        part that meets the floor and therefore says where somebody is
        standing, however tall they loom over it from nearer the camera. The
        scale guard is the second half of that: somebody whose silhouette
        dwarfs the marked area is in front of it, not on it.
        """
        height, width = frame.shape[:2]

        results = model(
            frame, verbose=False, conf=self._confidence, classes=[0]
        )

        found: list[dict[str, Any]] = []

        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None or len(boxes) == 0:
                continue

            masks = getattr(result, "masks", None)
            mask_data = (
                masks.data.cpu().numpy() if masks is not None else None
            )

            for index, box in enumerate(boxes.xyxy.cpu().numpy()):
                x1, y1, x2, y2 = (float(v) for v in box)
                conf = float(boxes.conf[index])

                person_mask = self._person_mask(
                    mask_data, index, (x1, y1, x2, y2), width, height
                )

                grounded = float(_grounded_share(person_mask, polygon_mask))
                person_pixels = int(cv2.countNonZero(person_mask))

                # Abstain rather than reject when the marked area is too
                # small for the ratio to mean anything.
                at_areas_scale = (
                    zone_pixels < MIN_ZONE_PIXELS
                    or person_pixels <= SCALE_RATIO * zone_pixels
                )

                found.append(
                    {
                        "box": (x1, y1, x2, y2),
                        "conf": conf,
                        "grounded": grounded,
                        "inside": (
                            grounded >= LOWER_OVERLAP_THRESHOLD
                            and at_areas_scale
                        ),
                    }
                )

        return found

    @staticmethod
    def _person_mask(
        mask_data,
        index: int,
        box: tuple[float, float, float, float],
        width: int,
        height: int,
    ) -> np.ndarray:
        """
        One person's silhouette at frame size, or their box if there is none.

        YOLO returns masks at inference resolution rather than the frame's, so
        an unscaled mask fails against a frame-sized polygon with a size
        mismatch. The box fallback keeps the module working if the weights
        ever turn out to be detect-only, at the cost of a rectangle full of
        floor — which is why it is a fallback and not the design.
        """
        canvas = np.zeros((height, width), dtype=np.uint8)

        if mask_data is not None and index < len(mask_data):
            mask = (mask_data[index] > 0.5).astype(np.uint8) * 255
            if mask.shape[:2] != (height, width):
                mask = cv2.resize(
                    mask, (width, height), interpolation=cv2.INTER_NEAREST
                )
            return mask

        x1, y1, x2, y2 = (int(round(v)) for v in box)
        cv2.rectangle(canvas, (x1, y1), (x2, y2), 255, -1)
        return canvas

    def _confirmed(self, seen_inside: bool, now: float) -> bool:
        """
        Whether enough recent frames agree somebody is in the area.

        Flicker only. It cannot and does not answer a detection failure that
        persists — the misses measured in the module docstring are exactly
        that, and no amount of agreeing frames recovers a person the model
        never found.
        """
        window = self._cadence.window
        self._votes = [v for v in self._votes if now - v[0] <= window]
        self._votes.append((now, seen_inside))

        if self.single_frame:
            # One photograph has no sequence to steady against, and the
            # operator asked about this picture.
            return seen_inside

        agreeing = sum(1 for _when, is_inside in self._votes if is_inside)

        return agreeing >= CONFIRM_SIGHTINGS

    # ------------------------------------------------------------------

    def _summarise(
        self,
        people: list[dict[str, Any]],
        showing: list[dict[str, Any]],
        stale: bool,
        alert: bool,
        reading,
        area,
        width: int,
        height: int,
    ) -> dict[str, Any]:
        """The state, in the words an operator reads."""
        # The live count, always. `showing` is what the *alarm* is standing
        # on — held over a dropped frame — and the two are not the same
        # number, so the page is never handed one labelled as the other.
        in_area = len([p for p in people if p["inside"]]) or len(showing)

        result = self.empty_result()
        result["area_configured"] = True
        result["workers_total"] = len(people)
        result["workers_in_area"] = in_area

        if not reading.readable:
            result["status"] = "unverified"
            result["summary"] = reading.reason or "Cannot check the picture."
        elif alert:
            result["status"] = "alert"
            result["alert"] = True
            result["summary"] = (
                "Somebody is in the lifting area"
                if in_area == 1
                else f"{in_area} people are in the lifting area"
            )
            if stale:
                result["summary"] += " (a moment ago)"
            result["spoken"] = "Alert! Somebody is in the lifting area"
        elif in_area:
            # Seen, not yet confirmed. Saying "nobody" here while the count
            # beside it reads three is the contradiction this branch exists
            # to remove: the operator is told what is being weighed, not
            # given an all-clear the module does not yet mean.
            result["status"] = "watching"
            result["summary"] = (
                "Somebody may be in the lifting area — checking"
                if in_area == 1
                else f"{in_area} people may be in the lifting area — checking"
            )
        else:
            result["status"] = "clear"
            result["summary"] = "Nobody is in the lifting area"

        result["regions"] = [
            self.region(
                person["box"],
                width,
                height,
                label=(
                    f"In lifting area ({person['grounded']:.2f})"
                    if person["inside"]
                    else "Worker"
                ),
                tone="danger" if person["inside"] else "muted",
                grounded=round(person["grounded"], 4),
                confidence=round(person["conf"], 3),
            )
            for person in people
        ]

        result["zones"] = [
            {
                "points": [
                    [round(x / width, 4), round(y / height, 4)]
                    for x, y in area
                ],
                "label": "Lifting area",
                "tone": "danger" if alert else "ok",
            }
        ]

        # Everything the later phases will answer. None, not False — see
        # UNBUILT_REASON.
        result["machine_state"] = "UNKNOWN"
        result["load_detected"] = None
        result["load_raised"] = None
        result["suspended_load"] = None
        result["state_reason"] = UNBUILT_REASON

        # People the picture stopped being good enough to judge.
        result.update(
            self.uncertainty(reading, len(people) if not reading.readable else 0)
        )

        return result

    def _annotate(
        self,
        frame: np.ndarray,
        people: list[dict[str, Any]],
        area,
        alert: bool,
    ) -> np.ndarray:
        """The live view: the marked area, and who is standing in it."""
        annotated = frame.copy()

        colour = COLOR_ALERT if alert else COLOR_CLEAR
        cv2.polylines(
            annotated,
            [np.array(area, dtype=np.int32)],
            isClosed=True,
            color=colour,
            thickness=2,
        )

        for person in people:
            x1, y1, x2, y2 = (int(round(v)) for v in person["box"])
            tone = COLOR_ALERT if person["inside"] else (150, 150, 150)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), tone, 2)

            if person["inside"]:
                cv2.putText(
                    annotated,
                    f"in lifting area {person['grounded']:.2f}",
                    (x1, max(14, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.45,
                    tone,
                    1,
                )

        return annotated

    # ------------------------------------------------------------------

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """
        One event while somebody is in the lifting area.

        Keyed on the area rather than the person: nothing here carries an
        identity across frames, so two workers stepping in one after the other
        is one situation continuing, which is what the record should say.

        Severity is `medium`, not `high`, and it is alarmable rather than
        log-only. Both are the operator's decision, taken with the trade in
        front of them: being in the area is a hazard worth sounding, and it
        is not yet proof of the hazard this module is named for — that
        verdict needs the load, and the load is a later phase.

        Recorded here because the later phases must not quietly inherit it.
        When a suspended load can actually be detected, *that* event is the
        one that earns `high`; this one keeps `medium` and keeps meaning
        what it means today, so a site that has tuned its response to this
        alarm is not re-pointed underneath by a change it never saw.
        """
        if not result.get("alert"):
            return []

        in_area = int(result.get("workers_in_area", 0) or 0)

        return [
            {
                "key": "worker-in-lifting-area",
                "severity": "medium",
                "summary": (
                    "Somebody is in the lifting area"
                    if in_area == 1
                    else f"{in_area} people are in the lifting area"
                ),
                "details": {
                    "workers_in_area": in_area,
                    "workers_in_view": int(result.get("workers_total", 0) or 0),
                    "machine_state": result.get("machine_state"),
                    "suspended_load": result.get("suspended_load"),
                    "state_reason": result.get("state_reason"),
                },
            }
        ]

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result.update(
            {
                "area_configured": bool(suspended_load_manager.as_points()),
                "workers_total": 0,
                "workers_in_area": 0,
                "machine_state": "UNKNOWN",
                "load_detected": None,
                "load_raised": None,
                "suspended_load": None,
                "state_reason": UNBUILT_REASON,
                "confidence": self._confidence,
                "spoken": None,
            }
        )
        return result

    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        return {
            "polygon": suspended_load_manager.as_points() or [],
            "confidence": self._confidence,
            "confidence_default": PERSON_CONFIDENCE,
            "confirm_sightings": CONFIRM_SIGHTINGS,
            "confirm_seconds_measured": round(self._cadence.window, 2),
            "hold_seconds": HOLD_SECONDS,
            "grounded_share": LOWER_OVERLAP_THRESHOLD,
            "classes": ["person"],
            "detects_load": False,
            "state_note": UNBUILT_REASON,
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Set the marked area and/or the confidence bar.

        Both are read before either is stored, so a payload with one good
        value and one bad one changes nothing.
        """
        changed: dict[str, Any] = {}

        # Read before either is stored, so a payload with one good value and
        # one bad one changes nothing.
        confidence = (
            fraction(payload["confidence"], "The confidence")
            if "confidence" in payload
            else None
        )

        if confidence is not None:
            self._confidence = confidence
            changed["confidence"] = confidence

        if "polygon" in payload:
            points = payload.get("polygon") or []

            if not points:
                suspended_load_manager.clear()
                changed["points"] = 0
            else:
                from app.camera import camera_manager

                changed["points"] = suspended_load_manager.save(
                    points,
                    source=camera_manager.current_source,
                    frame_width=payload.get("frame_width"),
                    frame_height=payload.get("frame_height"),
                )

            # A new area is a new question; nothing measured against the old
            # one still applies.
            self._votes = []
            self._last_inside = float("-inf")
            self._last_seen_inside = []

        if not changed:
            raise ValueError("Nothing to change.")

        return {"success": True, "message": "Settings updated.", **changed}


service = SuspendedLoadService()
