"""
Vehicle in restricted zone.

An operator draws the floor a vehicle must stay out of, and the module raises
an alarm while one is standing in it. The area is its own — see
`vision/polygon.py` — because a forklift aisle and a people-exclusion floor are
frequently the inverse of each other and sharing one shape would make marking
either silently re-aim the other.

## What these weights can actually report, measured

The supplied model has one class and it is `forklift`, not `vehicle`. Nothing
here can see a pallet truck, a tug, a crane or a van, and the page says so
rather than letting the capability's name imply otherwise.

More importantly, the weights over-trigger, and that is not a small caveat.
Measured across the four clips in `storage/uploads`, none of which contains a
forklift, at least one detection was returned on:

    confidence           0.25   0.50   0.60   0.80   0.90
    cctv_demo.webm        82%    47%    25%     3%     0%
    video.mp4             75%    43%    28%     5%     0%
    test_640x480.mp4      85%    47%    23%     5%     0%
    door_test.mp4         19%    10%    10%     2%     0%

Every one of those is a false positive, and the six most confident detections
anywhere — 0.816 to 0.844 — are five views of a worker's forearm and one of a
person sitting at a desk. A model taught only on images that all contain a
forklift is never shown what is not one, which is the usual cause and a
dataset gap rather than a code one.

Two things follow, and both are deliberate.

`ITEM_CONFIDENCE` was first set above every false positive that footage
produced — 0.85, over the 0.844 forearm. That was a mistake, and an instructive
one: 0.844 was also the highest score the model gave *anything*, so the floor
sat above the model's own ceiling and a real forklift, parked squarely in a
marked area, left the page reading "Area clear". Optimising a threshold against
negatives alone cannot see what it costs, and a raised threshold is exactly
what a silent collapse looks like from the operator's side.

It is 0.40 now — the door module's floor, and the point these weights were
trained at — because for this alarm a false alarm is a nuisance and a miss is
the hazard. Between `WATCH_CONFIDENCE` and that floor a detection is drawn in
amber with its score and raises nothing, so an operator whose forklift is not
alarming can read what it actually scored instead of guessing.

And confirmation over several frames is *not* offered as the answer to it.
That bar exists in this module for the same reason it exists on doors — one
frame must not raise an alarm — but a worker's arm stays in the picture for
hundreds of frames, so agreeing sightings do nothing about a systematic false
positive. Saying otherwise would be the reassuring half of the truth.
"""

import time
from typing import Any, Optional

import numpy as np

from app.core.config import MODELS_DIR
from app.core.validate import fraction
from app.modules.base import BaseMonitoringService
from app.vision.cadence import Cadence
from app.vision.legibility import read
from app.vision.polygon import vehicle_zone_manager

MODEL_PATH = MODELS_DIR / "forklift.pt"

#: The confidence a detection must reach before it can raise the alarm.
#:
#: Measured, finally, on footage where the answer is known — two clips of the
#: operator's own warehouse, one 848x478 and one 1280x720, swept frame by
#: frame with every detection drawn and looked at.
#:
#:     what a real forklift scores          0.76 - 0.84 typically
#:     strongest thing that was not one     0.41 on pallet racking
#:     true alarms kept at this floor       68 of 69 frames it was in the area
#:     false alarms at this floor           none found on either clip
#:
#: At 0.70 the true alarms fall to 47 of 69 — the model loses the vehicle when
#: it is partly behind racking or at the edge of frame — so this is the top of
#: the usable band rather than a round number picked for comfort.
#:
#: The history is worth keeping, because both earlier values were set from one
#: side of the evidence and both were wrong in the way that predicts. 0.85 was
#: chosen to clear every false positive on forklift-free footage, and landed
#: above the model's own observed ceiling: a forklift stood in the marked area
#: and the page read "Area clear". 0.40 was the correction, and it is under
#: what pallet racking can score in a warehouse. A threshold set from
#: negatives alone cannot see what it costs, and one set from positives alone
#: cannot see what it buys.
#:
#: What has not changed is that these weights over-trigger on scenes with no
#: forklift in them at all — a forearm at 0.84 on unrelated footage. On this
#: site they behave; do not read that as the model being sound.
ITEM_CONFIDENCE = 0.65

#: The confidence below which a detection is not even shown.
#:
#: Between this and ITEM_CONFIDENCE a detection is drawn and counted but raises
#: nothing, labelled with its score. That band is the instrument: an operator
#: whose forklift is not alarming can see whether the model found it at 0.31 or
#: did not find it at all, which are different problems with different answers,
#: and neither was distinguishable when anything under the floor was discarded
#: in silence.
WATCH_CONFIDENCE = 0.25

#: How much of a vehicle has to be inside the marked area to count as in it.
#:
#: Measured on the box rather than a segmentation mask — these weights detect
#: rather than segment, so the box is all there is, and a box around a forklift
#: contains a good deal of floor. A quarter of it inside is a vehicle
#: encroaching rather than one merely passing the edge of frame, and it is the
#: same order as the door module's own containment share.
INSIDE_SHARE = 0.25

#: How many agreeing sightings before the alarm, and over what window.
#:
#: The flicker bar, and only the flicker bar. One frame that thinks an arm is a
#: forklift cannot raise an alarm; a hundred consecutive frames that think so
#: still will, which is why the confidence floor above is doing the real work
#: and this is not sold as the safeguard.
#:
#: Two, not three. The bar costs `CONFIRM_SIGHTINGS - 1` frame intervals of
#: delay before the alarm, and over a tunnel to a hosted GPU a frame interval
#: is a third of a second or worse — so three sightings is most of a second
#: before an operator hears anything about a vehicle that is already on the
#: floor they were kept off. A door can afford to be argued into; a forklift
#: standing where people walk cannot, and unlike the door module this one has
#: a confidence floor and an area test in front of it, both of which a single
#: bad frame has to pass first.
CONFIRM_SIGHTINGS = 2
CONFIRM_WINDOW_SECONDS = 1.5

#: How long the alarm keeps sounding after the vehicle was last seen inside.
#:
#: The detector loses a vehicle for a frame or two at a time. Without this the
#: alarm stutters on and off while the forklift sits exactly where it should
#: not be, which reads as a fault in the system rather than a fact about the
#: floor.
HOLD_SECONDS = 2.0

COLOR_ALERT = (0, 0, 220)
COLOR_CLEAR = (0, 170, 0)

#: Seen in the area, under the alarm setting. Amber, like every other "the AI
#: has something to say but is not making a finding of it" state here.
COLOR_WATCH = (0, 170, 220)


class VehicleZoneService(BaseMonitoringService):
    """Raises an alarm while a forklift is standing inside the marked area."""

    module_id = "vehicle-zone"
    name = "Vehicle in Restricted Zone"
    description = (
        "The AI watches the marked area and alerts while a forklift is inside it."
    )

    def __init__(self) -> None:
        self._model = None
        self._load_failed = False
        self._confidence = ITEM_CONFIDENCE

        #: (when, inside) for recent frames, for the flicker bar.
        self._votes: list[tuple[float, bool]] = []

        #: When a vehicle was last confirmed inside, for HOLD_SECONDS.
        self._last_inside: Optional[float] = None

        #: What was in the area the last time anything was, kept for as long
        #: as the alarm it raised. The alarm outlives the sighting by design —
        #: the detector drops a vehicle for a frame or two — but the boxes
        #: were rebuilt from the current frame, so an intermittent detection
        #: held the alarm up while showing nothing at all. An operator then
        #: sees a red banner over an empty floor and has no way to tell a real
        #: forklift from this model deciding a pallet is one.
        self._last_seen_inside: list[dict[str, Any]] = []

        self._cadence = Cadence(CONFIRM_WINDOW_SECONDS, CONFIRM_SIGHTINGS)

        super().__init__()

    # ------------------------------------------------------------------

    def _now(self) -> float:
        """The clock, in one place so a test can advance it by hand."""
        return time.time()

    def _get_model(self):
        if self._model is not None or self._load_failed:
            return self._model

        if not MODEL_PATH.exists():
            self._load_failed = True
            print(f"[VehicleZone] No model at {MODEL_PATH}; module disabled.")
            return None

        try:
            from ultralytics import YOLO

            self._model = YOLO(str(MODEL_PATH))
            print(f"[VehicleZone] Model loaded: {self._model.names}")
        except Exception as exc:  # noqa: BLE001
            self._load_failed = True
            print(f"[VehicleZone] Could not load model: {exc}")

        return self._model

    def model_loaded(self) -> bool:
        return self._get_model() is not None

    def is_configured(self) -> bool:
        """Whether an operator has drawn an area that could enclose anything."""
        return vehicle_zone_manager.polygon is not None

    def is_ready(self) -> bool:
        return self.model_loaded() and self.is_configured()

    def reset(self) -> None:
        """
        Forget the drawn area and the timers when the camera changes.

        An area is coordinates on one particular picture; carried to another
        camera it watches whatever happens to sit there instead.
        """
        super().reset()
        self._votes = []
        self._last_inside = None
        self._last_seen_inside = []
        self._cadence.reset()

        if vehicle_zone_manager.polygon is not None:
            print("[VehicleZone] Camera changed; clearing the marked area.")
            vehicle_zone_manager.clear()

    def reset_session_state(self) -> None:
        """Give this copy its own timers, so two browsers do not share one."""
        self._votes = []
        self._last_inside = None
        self._last_seen_inside = []
        self._cadence = Cadence(CONFIRM_WINDOW_SECONDS, CONFIRM_SIGHTINGS)

    # ------------------------------------------------------------------

    def _share_inside(self, box, width: int, height: int) -> float:
        """
        How much of a detection's box lies inside the marked area, 0 to 1.

        `overlap_percentage` is named for a percentage and documented as
        returning "a float between 0 and 1", and the documentation is the one
        telling the truth — it divides an intersection by a box area. Dividing
        it by a hundred again would have put every share at a quarter of a
        percent and this module would never once have raised an alarm.

        The corners are rounded here because that helper rasterises the box
        with `cv2.rectangle`, which will not take floats.
        """
        x1, y1, x2, y2 = (int(round(v)) for v in box)

        # The frame's own size, every time. The area is stored in the pixels
        # it was drawn on and the browser steps between 640, 576 and 512 wide
        # as the link allows — without this the two are different coordinate
        # spaces and a forklift on the marked floor reads as outside it.
        return float(
            vehicle_zone_manager.overlap_percentage(
                x1, y1, x2, y2, frame_width=width, frame_height=height
            )
        )

    def _confirmed(self, seen_inside: bool, now: float) -> bool:
        """
        Whether enough recent frames agree that something is inside.

        Flicker only. See CONFIRM_SIGHTINGS — this cannot and does not answer
        a false positive that persists.
        """
        window = self._cadence.window
        self._votes = [v for v in self._votes if now - v[0] <= window]
        self._votes.append((now, seen_inside))

        if self.single_frame:
            # One photograph has no sequence to steady against, and the
            # operator asked about this picture.
            return seen_inside

        agreeing = sum(1 for _when, inside in self._votes if inside)

        return agreeing >= CONFIRM_SIGHTINGS

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        model = self._get_model()

        if model is None:
            return frame, self._store(self.empty_result())

        now = self._now()
        self._cadence.tick(now)

        height, width = frame.shape[:2]

        # Asked before anything is concluded, so a picture too dark to read
        # cannot produce a confident "Area clear".
        reading = read(frame, self.module_id)

        if not self.is_configured():
            # Nothing is watched until somebody says what to watch. The model
            # is not run at all: with no area there is no question to answer,
            # and finding "a forklift" somewhere in the frame is exactly the
            # claim these weights cannot support.
            result = self.empty_result()
            result["summary"] = "No area marked"
            return frame, self._store(result)

        detections = []
        for output in model(frame, verbose=False, conf=WATCH_CONFIDENCE):
            for box in output.boxes:
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                confidence = float(box.conf[0])
                detections.append(
                    {
                        "box": (x1, y1, x2, y2),
                        "conf": confidence,
                        "share": self._share_inside((x1, y1, x2, y2), width, height),
                        # Above the floor it can raise the alarm; below it, it
                        # is shown with its score and does nothing else.
                        "alerting": confidence >= self._confidence,
                    }
                )

        inside = [
            d for d in detections
            if d["share"] >= INSIDE_SHARE and d["alerting"]
        ]

        #: Found in the area, but not confidently enough to raise anything.
        #: Counted so the page can say so, because "nothing was found" and
        #: "something was found at 0.31" are different sentences.
        watching = [
            d for d in detections
            if d["share"] >= INSIDE_SHARE and not d["alerting"]
        ]

        seen_inside = bool(inside) and reading.readable
        confirmed = self._confirmed(seen_inside, now)

        if confirmed and seen_inside:
            self._last_inside = now
            self._last_seen_inside = inside

        # Held briefly, so a detector that loses the vehicle for a frame does
        # not turn a standing hazard into a stuttering alarm.
        holding = (
            self._last_inside is not None
            and now - self._last_inside <= HOLD_SECONDS
        )

        alert = bool(holding and reading.readable)

        annotated = self._draw(frame, detections, alert)

        # Only what the answer is about. A forklift parked outside the marked
        # area is not a finding — it is a forklift doing its job — and boxing
        # it made a page whose whole question is "is one on that floor" answer
        # with five labels, four of which said no.
        # What the alarm is about. During the hold there is nothing in this
        # frame, so the sighting that raised it is shown instead — dimmed and
        # said to be a moment old, because it is a memory and pretending
        # otherwise is how this module would start drawing boxes around floor.
        showing = inside if inside else (self._last_seen_inside if alert else [])
        stale = alert and not inside

        regions = [
            self.region(
                detection["box"],
                width,
                height,
                label=(
                    f"Forklift in restricted area ({detection['conf']:.0%})"
                    if not stale
                    else f"Forklift a moment ago ({detection['conf']:.0%})"
                ),
                tone="danger",
            )
            for detection in showing
        ]

        zones = []
        area = vehicle_zone_manager.points_for(width, height)

        if area is not None:
            zones.append(
                {
                    "points": [
                        [round(float(x) / width, 4), round(float(y) / height, 4)]
                        for x, y in area
                    ],
                    # Green when the floor is clear, red when it is not, and
                    # nothing else. It was amber whenever it was not alarming,
                    # which is the palette's "something is unresolved" — so
                    # the marked area read as a standing warning even with
                    # nothing on it, and the page never once looked clear.
                    #
                    # Amber is kept for the one case that really is
                    # unresolved: a picture too poor to judge, where neither
                    # green nor red would be true.
                    "tone": (
                        "danger" if alert
                        else "warning" if not reading.readable
                        else "ok"
                    ),
                }
            )

        result = self._store(
            {
                "alert": alert,
                "status": (
                    "alert" if alert
                    else "unverified" if not reading.readable
                    else "clear"
                ),
                # Two answers about the floor, and nothing in between. The
                # module knows more than this — what it half-saw, and at what
                # score — and that stays in the payload below for anyone
                # tuning the setting. It is not a third thing to read on a
                # screen somebody is watching for one fact.
                #
                # The exception is not a third answer, it is the absence of
                # one: a picture too dark or too blurred to read cannot be
                # called clear, and every capability in this product says so
                # rather than guessing. That is the whole of Phase 2.
                "summary": (
                    "Forklift inside the restricted area"
                    if alert
                    else reading.reason
                    if not reading.readable
                    else "Area clear"
                ),
                # What the alarm should say out loud. Carried from here rather
                # than written into the page, so the words an operator hears
                # and the words the module means cannot drift apart.
                "spoken": (
                    "Alert! Forklift is inside the restricted zone"
                    if alert
                    else None
                ),
                "detections": [],
                "regions": regions,
                "zones": zones,
                "vehicles_total": len(detections),
                "vehicles_inside": len(inside),
                # Found in the area but under the alarm setting. Published so
                # the page can say "seen at 31%, below your 40% setting"
                # instead of "Area clear", which is the difference between an
                # operator who can fix this and one who cannot.
                "vehicles_watching": len(watching),
                "watching_confidence": (
                    max((d["conf"] for d in watching), default=None)
                ),
                "watch_confidence": WATCH_CONFIDENCE,
                "zone_configured": True,
                "confidence": self._confidence,
                # This module judges no people, so nobody is left unverified by
                # it — but a picture it cannot read is still a picture it must
                # not call clear.
                **self.uncertainty(reading),
            }
        )

        return annotated, result

    def _draw(self, frame: np.ndarray, detections, alert: bool) -> np.ndarray:
        """The marked area and anything found in it, painted on the frame."""
        import cv2

        annotated = frame.copy()
        height, width = annotated.shape[:2]
        area = vehicle_zone_manager.points_for(width, height)

        if area is not None:
            cv2.polylines(
                annotated,
                [area],
                isClosed=True,
                color=COLOR_ALERT if alert else COLOR_CLEAR,
                thickness=2,
            )

        # Same rule as the regions above: only what the answer is about.
        painted = [
            d for d in detections
            if d["share"] >= INSIDE_SHARE and d["alerting"]
        ] or (self._last_seen_inside if alert else [])

        for detection in painted:
            x1, y1, x2, y2 = (int(v) for v in detection["box"])
            colour = COLOR_ALERT
            cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)
            cv2.putText(
                annotated,
                f"forklift {detection['conf']:.2f}",
                (x1, max(14, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 2,
            )

        return annotated

    # ------------------------------------------------------------------

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """One event per intrusion, keyed on the area rather than the vehicle."""
        if not result.get("alert"):
            return []

        inside = int(result.get("vehicles_inside") or 1)

        return [
            {
                "key": "vehicle-intrusion",
                "severity": "high",
                "summary": (
                    "A forklift entered the restricted area"
                    if inside <= 1
                    else f"{inside} forklifts entered the restricted area"
                ),
                "details": {"vehicles_inside": inside},
            }
        ]

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result["vehicles_total"] = 0
        result["vehicles_inside"] = 0
        result["vehicles_watching"] = 0
        result["watching_confidence"] = None
        result["watch_confidence"] = WATCH_CONFIDENCE
        result["zone_configured"] = self.is_configured()
        result["confidence"] = self._confidence
        result["spoken"] = None
        return result

    # ------------------------------------------------------------------
    # Configuration — the drawn area, and the confidence floor
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        return {
            "polygon": vehicle_zone_manager.as_points(),
            "confidence": self._confidence,
            "confidence_default": ITEM_CONFIDENCE,
            "watch_confidence": WATCH_CONFIDENCE,
            "inside_share": INSIDE_SHARE,
            # What the flicker bar costs, said out loud rather than left for
            # somebody to notice as lag. One frame interval at the rate frames
            # are actually arriving.
            "confirm_sightings": CONFIRM_SIGHTINGS,
            "confirm_seconds_measured": round(
                (CONFIRM_SIGHTINGS - 1) * (self._cadence.interval or 0.2), 2
            ),
            "classes": ["forklift"],
            # Said in the configuration rather than only in a docstring,
            # because the operator setting the number is the person who most
            # needs to know how it was arrived at.
            "confidence_note": (
                "Measured on two clips of this warehouse: a real forklift "
                "scores 0.76-0.84, and the strongest thing that was not one "
                "scored 0.41 on pallet racking. At 65% every true alarm but "
                "one is kept and no false alarm was found; at 70% a third of "
                "the true alarms are lost when the vehicle is partly hidden. "
                "Lower it and pallets start to qualify; raise it and a "
                "forklift can stand in the area unreported."
            ),
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Save a drawn area, a confidence floor, or both.

        Raises:
            ValueError: if the area could never enclose anything, or the
                confidence is not a fraction. Refused rather than stored and
                then reported as ready.
        """
        changed: dict[str, Any] = {}

        if "confidence" in payload:
            self._confidence = fraction(
                payload["confidence"], "The confidence"
            )
            changed["confidence"] = self._confidence

        if "polygon" in payload:
            points = payload.get("polygon") or []

            if not points:
                vehicle_zone_manager.clear()
                changed["points"] = 0
            else:
                from app.camera import camera_manager

                changed["points"] = vehicle_zone_manager.save(
                    points,
                    source=camera_manager.current_source,
                    frame_width=payload.get("frame_width"),
                    frame_height=payload.get("frame_height"),
                )

            # A new area is a new question; the old area's timers say nothing
            # about it.
            self._votes = []
            self._last_inside = None
            self._last_seen_inside = []

        if not changed:
            raise ValueError("Nothing to change.")

        return {"success": True, "message": "Settings updated.", **changed}


service = VehicleZoneService()
