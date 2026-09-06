"""
Object blocking walkways.

An operator draws the lane that has to stay clear, and the module raises an
alarm while something is left standing in it. How "something that is not
floor" is decided is `vision/walkway.py`, including the two approaches that
were measured and abandoned first; this file is about the two questions that
sit on top of it, and both of them are about people.

## A person walking down a walkway is a walkway working

The detector finds what is not floor, and a worker is emphatically not floor.
Left alone it would alarm on every person who used the corridor for its
purpose, which is the one failure that would get this capability switched off
inside a week. So the person model runs first and its pixels are removed from
the marked area — before the floor is learned as well as before anything is
looked for, because a coat left in the picture becomes one of the colours the
floor is then judged against.

One frame of that was not enough, and the page shipped with the gap: a person
standing in the lane was flagged. The ground under and around a person stays
excluded for PERSON_MEMORY seconds after they were last seen — see that
constant for the measurements — so a missed frame, a shadow or a reflection
cannot turn somebody using the walkway into a violation.

## And an object being carried through is not an obstruction either

"Blocking" is not a fact about one frame. A pallet truck crossing the lane and
a pallet abandoned in it look identical in a photograph and are opposites on a
plant floor, and only time separates them. So a candidate has to stay in
substantially the same place for `SETTLE_SECONDS` before anything is raised.

That is a real delay and it is not hidden: the page says how long the wait is
and how far through it a candidate has got. It is the difference between a
capability an operator trusts and one that cries wolf at every trolley.

The choice of `SETTLE_SECONDS` is the one number here with no measurement
behind it, and it is written down as such rather than dressed up. The
operator's clip is ten seconds long with a static box, so it can show that a
settled object alarms; it cannot show what wait best separates traffic from
abandonment, because nothing traverses it. Five seconds is a judgement — long
enough that a person pushing a cage through does not trip it at walking pace,
short enough that a pallet dropped in a fire lane is reported while whoever
dropped it is still in earshot. It is adjustable per site for that reason.
"""

import time
from typing import Any, Optional

import cv2
import numpy as np

from app.core.validate import fraction, positive
from app.modules.base import BaseMonitoringService
from app.vision.legibility import read
from app.vision.polygon import walkway_manager
from app.vision.walkway import MIN_AREA_SHARE, MIN_FILL, find_obstructions

#: How long something has to stay put before it is called an obstruction.
#:
#: See the module docstring: a judgement, not a measurement, and adjustable.
SETTLE_SECONDS = 5.0

#: How far a candidate may move between frames and still be the same thing.
#:
#: As a share of the picture's diagonal, so it means the same on any
#: resolution. Generous on purpose: this is only about recognising a thing
#: from one frame to the next, and losing track of a pallet because the blob
#: around it grew a corner would restart its wait for no reason.
SAME_THING = 0.06

#: How much a candidate must still overlap where it was first seen for its
#: wait to keep running, as an intersection over union.
#:
#: This is what makes the wait mean "left there" rather than "still in shot",
#: and it was missing from the first version: matching frame to frame at
#: SAME_THING alone tracks a moving object perfectly well and lets it collect
#: settling time while it travels, so a trolley pushed across the lane over
#: five seconds raised the same alarm as a pallet dropped in it.
#:
#: Overlap rather than the distance the centre has moved, which is what was
#: tried first. A blob clipped by the edge of the marked lane has a centre
#: pinned to that edge: the object slides out of the picture while the visible
#: part of it, and therefore its centre, stops moving. Overlap sees that,
#: because the part still inside is shrinking.
#:
#: Measured on the operator's clip, over the 237 frames the box is found in:
#:
#:     a genuinely stationary object, overlap with where it was first seen
#:         minimum 0.69, 5th percentile 0.71, median 0.74
#:
#: Not higher, because the blob's own bounding box breathes — the object's
#: contact shadow is included on some frames and not others, which takes its
#: height from 103 pixels to 82. 0.50 sits well below the worst a stationary
#: object measured and well above the 0.29 an object crossing at 30 pixels a
#: frame holds after two frames.
#:
#: Its share of the lane was measured too, as a candidate for this test, and
#: rejected on the evidence: the same stationary object ranged from 5.8% to
#: 12.4%, which is far too noisy to threshold on.
STAYED_PUT = 0.50

#: How long the alarm keeps sounding after the object was last seen.
#:
#: The detector drops a blob for a frame or two when somebody walks in front
#: of it. Without this the alarm stutters while a pallet sits exactly where it
#: should not be, which reads as a fault in the system rather than a fact
#: about the floor.
HOLD_SECONDS = 3.0

#: A candidate not seen for this long is forgotten, and its wait restarts.
#:
#: Longer than HOLD_SECONDS on purpose: the alarm should stop before the
#: memory does, so an object that reappears after a brief occlusion does not
#: serve its whole settling time again.
FORGET_SECONDS = 6.0

#: Confidence the person model must reach before its pixels are cut out.
#:
#: Deliberately below the 0.45 the restricted zone uses. The cost of the two
#: mistakes is not symmetric here: cutting out something that was not a person
#: loses a patch of floor from the analysis, while failing to cut out a person
#: who was there raises a false alarm on a worker doing their job.
PERSON_CONFIDENCE = 0.30

#: How much a person's mask is grown before being cut out, as a share of the
#: picture's shorter side — so it means the same at 1280x720 and at 512x288,
#: which the browser steps between as the link allows.
#:
#: A segmentation mask clips tight to the body and leaves a fringe of coat
#: edge and contact shadow behind, which is foreign-coloured, person-shaped and
#: exactly where a person was.
PERSON_MARGIN = 0.021

#: How far *below* a person the exclusion reaches, on the same scale.
#:
#: Separate from the margin above, and larger, because the residue a person
#: leaves is not symmetrical. Measured: a person composited into the marked
#: lane was segmented by the model, cut out with an even margin, and a blob
#: was still reported at the bottom 33 pixels of them — their feet. The mask
#: ends at the ankle, and below the ankle is the shoe and the contact shadow,
#: which are the two least floor-coloured things in the picture.
#:
#: This is the direction that matters because people stand on the ground: what
#: is above them is air, and what is below them is the surface being judged.
PERSON_FOOT_REACH = 0.055

#: How long the ground where a person stood keeps being treated as theirs.
#:
#: Two failures this closes, both measured by driving this service over real
#: footage of people in a marked lane rather than found by reading the code.
#:
#: The exclusion used to be one frame deep. A person is cut out of the frame
#: they are detected in — and on any frame the person model misses them, every
#: pixel of them is suddenly foreign, compact and person-sized. And even on
#: footage where the model found every person on every frame, the mask does
#: not cover everything a person changes about the floor: their cast shadow
#: and reflection sit beyond any margin that leaves the lane worth watching.
#: Driven over two clips of people in a marked lane, those residues were
#: reported as candidates on most frames — up to four at once, drawn amber on
#: and around the people — and aged to 5.8 s against a 5.0 s wait, kept from
#: sounding only by the accident of which exact frame they were re-sighted on.
#: A person standing still, which is precisely what an operator testing the
#: page does, has no such luck.
#:
#: So a person's ground now stays excluded for this long after they were last
#: seen on it, and nothing that overlaps that ground can begin or continue a
#: wait. What this costs is real and accepted: an object abandoned exactly
#: where somebody just stood starts its wait up to this many seconds late.
PERSON_MEMORY = 3.0

#: How far beyond a remembered person's box their ground extends, as a share
#: of the picture's shorter side.
#:
#: This is what covers the shadow and the reflection — the parts of a person's
#: footprint that are on the floor rather than of the body, which the
#: segmentation mask can never include and the measured residues were made of.
PERSON_GROUND = 0.05

COLOR_ALERT = (0, 0, 220)
COLOR_CLEAR = (0, 170, 0)
COLOR_SETTLING = (0, 170, 220)


def _overlap(one, other) -> float:
    """How much two boxes share, as an intersection over their union."""
    ax1, ay1, ax2, ay2 = one
    bx1, by1, bx2, by2 = other

    across = max(0, min(ax2, bx2) - max(ax1, bx1))
    down = max(0, min(ay2, by2) - max(ay1, by1))
    shared = across * down

    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - shared

    return shared / union if union > 0 else 0.0


class WalkwaysService(BaseMonitoringService):
    """Raises an alarm while something is left blocking the marked walkway."""

    module_id = "walkways"
    name = "Object Blocking Walkways"
    description = (
        "The AI watches the marked walkway and alerts when something is left "
        "blocking it."
    )

    def __init__(self) -> None:
        self._settle_seconds = SETTLE_SECONDS
        self._min_share = MIN_AREA_SHARE

        #: Candidates being timed: centre, box, share, first seen, last seen.
        self._candidates: list[dict[str, Any]] = []

        #: When something was last confirmed blocking, for HOLD_SECONDS.
        self._last_blocked: Optional[float] = None

        #: Ground recently seen under a person, as fraction boxes with an
        #: expiry. See PERSON_MEMORY for why this exists and what it costs.
        self._people_seen: list[dict[str, Any]] = []

        #: What raised the alarm, kept for as long as the alarm it raised —
        #: the same reason the vehicle module keeps its last sighting. During
        #: the hold there is nothing in this frame, and a red banner over an
        #: empty floor is unfalsifiable from the operator's side.
        self._last_seen: list[dict[str, Any]] = []

        super().__init__()

    # ------------------------------------------------------------------

    def _now(self) -> float:
        """The clock, in one place so a test can advance it by hand."""
        return time.time()

    def model_loaded(self) -> bool:
        """
        Always true, and honestly so.

        The floor model carries no weights — it is arithmetic on the picture.
        The person model it also uses is built at import time in
        app/vision/detector.py, so weights that will not load take the import
        down rather than leaving this module reporting itself healthy.
        """
        return True

    def is_configured(self) -> bool:
        """Whether an operator has drawn a walkway that could enclose anything."""
        return walkway_manager.polygon is not None

    def is_ready(self) -> bool:
        return self.is_configured()

    def reset(self) -> None:
        """Forget the walkway and the timers when the camera changes."""
        super().reset()
        self._candidates = []
        self._last_blocked = None
        self._last_seen = []
        self._people_seen = []

        if walkway_manager.polygon is not None:
            print("[Walkways] Camera changed; clearing the marked walkway.")
            walkway_manager.clear()

    def reset_session_state(self) -> None:
        """Give this copy its own timers, so two browsers do not share one."""
        self._candidates = []
        self._last_blocked = None
        self._last_seen = []
        self._people_seen = []

    # ------------------------------------------------------------------

    def _people(self, frame: np.ndarray) -> tuple[np.ndarray, int, list]:
        """
        A mask of everybody in the picture, how many, and their boxes.

        Shares the segmentation model the restricted zone already loads, so
        this costs no extra weights and no extra memory. The boxes come back
        in this frame's pixels, for the caller to remember as ground.
        """
        from app.vision.detector import model as person_model

        height, width = frame.shape[:2]
        mask = np.zeros((height, width), np.uint8)
        count = 0
        boxes: list = []

        try:
            outputs = person_model(
                frame, verbose=False, classes=[0], conf=PERSON_CONFIDENCE
            )
        except Exception as exc:  # noqa: BLE001
            # A person model that will not run must not become a walkway full
            # of obstructions. Reported, and the frame is judged with nobody
            # cut out — which is the conservative direction only for missing an
            # object, so the caller is told people could not be excluded.
            print(f"[Walkways] Person model failed on this frame: {exc}")
            return mask, -1, boxes

        for output in outputs:
            # The bounding box as well as the outline, always, and their union
            # is what gets cut out.
            #
            # The outline alone was tried and it leaves people behind. A person
            # composited into the marked lane was detected, segmented and cut
            # out with a margin, and a blob was still reported across their
            # lower legs: the mask is a good outline of a body and a poor
            # guarantee of covering one, and every pixel it misses is a pixel
            # that looks foreign and is shaped like a person.
            #
            # The box costs floor. A person with an arm out removes a rectangle
            # of lane that is not being watched while they stand there, and
            # floor removed is floor an object could be left on unseen. That is
            # the right side to err on: the object stays and will be found the
            # moment they move, whereas an alarm on a worker walking to their
            # station is the failure that gets a capability switched off.
            for box in output.boxes:
                x1, y1, x2, y2 = (int(v) for v in box.xyxy[0])
                cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
                boxes.append((x1, y1, x2, y2))
                count += 1

            if output.masks is None:
                continue

            for person in output.masks.data:
                shape = (person.cpu().numpy() * 255).astype(np.uint8)
                if shape.shape != (height, width):
                    shape = cv2.resize(shape, (width, height))
                mask = cv2.bitwise_or(mask, shape)

        if count > 0:
            scale = min(width, height)
            margin = max(3, int(PERSON_MARGIN * scale) | 1)
            reach = max(4, int(PERSON_FOOT_REACH * scale))

            mask = cv2.dilate(
                mask,
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (margin, margin)),
            )

            # Then downwards only, anchored at the top of the kernel so the
            # growth goes one way. An even margin big enough to cover a
            # person's feet would also swallow a good deal of the floor over
            # their head, and floor removed from the analysis is floor an
            # object can be left on unseen.
            mask = cv2.dilate(
                mask,
                cv2.getStructuringElement(cv2.MORPH_RECT, (1, reach)),
                anchor=(0, 0),
            )

        return mask, count, boxes

    def _settle(self, found, now: float, diagonal: float) -> list[dict[str, Any]]:
        """
        Match what was found to what is already being timed, and age the rest.

        Returns the candidates that have now been in place long enough to be
        called obstructions.
        """
        self._candidates = [
            c for c in self._candidates if now - c["last_seen"] <= FORGET_SECONDS
        ]

        reach = SAME_THING * diagonal

        for obstruction in found:
            centre = obstruction.centre
            nearest = None
            best = reach

            for candidate in self._candidates:
                distance = float(
                    np.hypot(
                        centre[0] - candidate["centre"][0],
                        centre[1] - candidate["centre"][1],
                    )
                )
                if distance < best:
                    nearest, best = candidate, distance

            if nearest is None:
                self._candidates.append(
                    {
                        "centre": centre,
                        "first_box": obstruction.box,
                        "box": obstruction.box,
                        "share": obstruction.share,
                        "outline": obstruction.outline,
                        "first_seen": now,
                        "last_seen": now,
                    }
                )
                continue

            nearest.update(
                centre=centre,
                box=obstruction.box,
                share=obstruction.share,
                outline=obstruction.outline,
                last_seen=now,
            )

            # Still the same thing, but is it still in the same place? A
            # candidate that has travelled has not been left anywhere yet, so
            # its wait starts again from where it is now.
            if _overlap(obstruction.box, nearest["first_box"]) < STAYED_PUT:
                nearest["first_seen"] = now
                nearest["first_box"] = obstruction.box

        if self.single_frame:
            # One photograph has no sequence to settle against, and the
            # operator asked about this picture. Every candidate counts.
            return list(self._candidates)

        # `last_seen == now` — it has to be in *this* frame, not merely
        # remembered. Without that clause a candidate went on ageing in the
        # list after the thing had gone, finished its wait while nothing was
        # there, and raised the alarm about an object that had left the lane
        # four seconds earlier. Measured: a rectangle pushed across the marked
        # lane was fully out of it by 6.5s and alarmed at 9.5s.
        #
        # Frames that drop out are covered by HOLD_SECONDS, which keeps an
        # alarm already raised alive while the detector loses the object for a
        # moment. That is the right place for it — holding an alarm that has
        # been earned, rather than letting one be earned in absentia.
        return [
            c for c in self._candidates
            if c["last_seen"] >= now
            and now - c["first_seen"] >= self._settle_seconds
        ]

    def process(self, frame: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        now = self._now()
        height, width = frame.shape[:2]

        # Asked before anything is concluded, so a picture too dark to read
        # cannot produce a confident "Walkway clear".
        reading = read(frame, self.module_id)

        if not self.is_configured():
            result = self.empty_result()
            result["summary"] = "No walkway marked"
            return frame, self._store(result)

        area = walkway_manager.points_for(width, height)

        if area is None:
            result = self.empty_result()
            result["summary"] = "No walkway marked"
            return frame, self._store(result)

        people_mask, people, person_boxes = self._people(frame)

        # Everybody seen now claims their ground for PERSON_MEMORY, and the
        # ground of everybody recently seen is cut out alongside them — as
        # fractions, so a browser stepping the frame size mid-session cannot
        # land remembered ground in the wrong place.
        for x1, y1, x2, y2 in person_boxes:
            self._people_seen.append(
                {
                    "box": (x1 / width, y1 / height, x2 / width, y2 / height),
                    "until": now + PERSON_MEMORY,
                }
            )

        self._people_seen = [p for p in self._people_seen if p["until"] > now]

        if self._people_seen:
            grow = int(PERSON_GROUND * min(width, height))
            reach = int(PERSON_FOOT_REACH * min(width, height))
            for entry in self._people_seen:
                fx1, fy1, fx2, fy2 = entry["box"]
                cv2.rectangle(
                    people_mask,
                    (int(fx1 * width) - grow, int(fy1 * height) - grow),
                    (int(fx2 * width) + grow, int(fy2 * height) + grow + reach),
                    255,
                    -1,
                )

        found, floor, marked = find_obstructions(
            frame, area, exclude=people_mask, min_share=self._min_share
        )

        # Nothing in the marked strip looked like floor. That is not a clear
        # walkway and it is not a blocked one — it is a walkway this module
        # cannot read, and saying so is the whole of Phase 2. It happens when
        # the marked area is mostly not floor at all.
        floor_unreadable = not floor.usable and marked > 0

        diagonal = float(np.hypot(width, height))
        settled = self._settle(found, now, diagonal) if reading.readable else []

        if settled:
            self._last_blocked = now
            self._last_seen = settled

        holding = (
            self._last_blocked is not None
            and now - self._last_blocked <= HOLD_SECONDS
        )

        alert = bool(holding and reading.readable and not floor_unreadable)

        showing = settled if settled else (self._last_seen if alert else [])
        stale = alert and not settled

        regions = [
            self.region(
                candidate["box"],
                width,
                height,
                label=(
                    f"Blocking the walkway ({candidate['share']:.0%} of it)"
                    if not stale
                    else f"Blocking a moment ago ({candidate['share']:.0%})"
                ),
                tone="danger",
                outline=candidate.get("outline") or None,
            )
            for candidate in showing
        ]

        # Candidates still serving their time. Drawn amber and named as
        # waiting, never as a finding — this is the module showing its working,
        # so an operator watching a trolley cross the lane can see the system
        # noticed it and chose not to shout.
        waiting = [
            c for c in self._candidates
            if c not in settled and now - c["last_seen"] < 1.0
        ]

        regions += [
            self.region(
                candidate["box"],
                width,
                height,
                label=(
                    "Checking whether this is being left there "
                    f"({min(now - candidate['first_seen'], self._settle_seconds):.0f}"
                    f"/{self._settle_seconds:.0f}s)"
                ),
                tone="warning",
                outline=candidate.get("outline") or None,
            )
            for candidate in waiting
        ]

        zones = [
            {
                "points": [
                    [round(float(x) / width, 4), round(float(y) / height, 4)]
                    for x, y in area
                ],
                # Green when the lane is clear, red when it is not. Amber only
                # for the one case that is genuinely unresolved — a picture
                # this module cannot read — because a marked area drawn as a
                # standing warning is a page that never looks clear, which is
                # what the vehicle module had to be corrected for.
                "tone": (
                    "danger" if alert
                    else "warning" if not reading.readable or floor_unreadable
                    else "ok"
                ),
            }
        ]

        annotated = self._draw(frame, area, showing, waiting, alert)

        result = self._store(
            {
                "alert": alert,
                "status": (
                    "alert" if alert
                    else "unverified" if not reading.readable or floor_unreadable
                    else "clear"
                ),
                # Two answers about the walkway and nothing in between, the
                # same rule the vehicle zone settled on. What is still being
                # timed is in the payload and drawn on the picture; it is not
                # a third thing to read on a screen somebody is watching for
                # one fact.
                "summary": (
                    "Object blocking the walkway"
                    if alert
                    else reading.reason
                    if not reading.readable
                    else "Cannot tell — little of the marked area looks like floor"
                    if floor_unreadable
                    else "Walkway clear"
                ),
                "spoken": (
                    "Alert! Object is blocking the walkway" if alert else None
                ),
                "detections": [],
                "regions": regions,
                "zones": zones,
                # What it is about, for the page to say in words.
                "objects_blocking": len(showing),
                "objects_settling": len(waiting),
                "largest_share": (
                    round(max(c["share"] for c in showing), 4) if showing else None
                ),
                # How long the wait is, so the page can say it rather than
                # leaving the delay to be discovered as lag.
                "settle_seconds": self._settle_seconds,
                "settling_progress": (
                    round(
                        min(
                            1.0,
                            max(
                                (now - c["first_seen"]) / self._settle_seconds
                                for c in waiting
                            ),
                        ),
                        3,
                    )
                    if waiting
                    else None
                ),
                # How many people were cut out before the floor was judged, so
                # an operator can see the exclusion is working. -1 means the
                # person model failed on this frame and nobody was cut out.
                "people_excluded": people,
                "floor_colours": floor.colours,
                "floor_readable": not floor_unreadable,
                "min_share": self._min_share,
                "zone_configured": True,
                # This module judges no people, so nobody is left unverified by
                # it — but a picture it cannot read is still a picture it must
                # not call clear.
                **self.uncertainty(reading),
            }
        )

        return annotated, result

    def _draw(self, frame, area, blocking, waiting, alert: bool) -> np.ndarray:
        """The marked walkway and what is in it, painted on the frame."""
        annotated = frame.copy()

        cv2.polylines(
            annotated,
            [area],
            isClosed=True,
            color=COLOR_ALERT if alert else COLOR_CLEAR,
            thickness=2,
        )

        for candidate in waiting:
            x1, y1, x2, y2 = (int(v) for v in candidate["box"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), COLOR_SETTLING, 2)

        for candidate in blocking:
            x1, y1, x2, y2 = (int(v) for v in candidate["box"])
            cv2.rectangle(annotated, (x1, y1), (x2, y2), COLOR_ALERT, 2)
            cv2.putText(
                annotated,
                f"blocking {candidate['share']:.0%}",
                (x1, max(14, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_ALERT, 2,
            )

        return annotated

    # ------------------------------------------------------------------

    def events(self, result: dict[str, Any]) -> list[dict[str, Any]]:
        """One event per blocked walkway, keyed on the walkway not the object."""
        if not result.get("alert"):
            return []

        blocking = int(result.get("objects_blocking") or 1)

        return [
            {
                "key": "walkway-blocked",
                "severity": "medium",
                "summary": (
                    "Something is blocking the walkway"
                    if blocking <= 1
                    else f"{blocking} objects are blocking the walkway"
                ),
                "details": {
                    "objects_blocking": blocking,
                    "largest_share": result.get("largest_share"),
                },
            }
        ]

    def empty_result(self) -> dict[str, Any]:
        result = super().empty_result()
        result["objects_blocking"] = 0
        result["objects_settling"] = 0
        result["largest_share"] = None
        result["settle_seconds"] = getattr(self, "_settle_seconds", SETTLE_SECONDS)
        result["settling_progress"] = None
        result["people_excluded"] = 0
        result["floor_colours"] = 0
        result["floor_readable"] = True
        result["min_share"] = getattr(self, "_min_share", MIN_AREA_SHARE)
        result["zone_configured"] = self.is_configured()
        result["spoken"] = None
        return result

    # ------------------------------------------------------------------
    # Configuration — the drawn walkway, the wait, and the smallest object
    # ------------------------------------------------------------------

    def is_configurable(self) -> bool:
        return True

    def get_config(self) -> dict[str, Any]:
        return {
            "polygon": walkway_manager.as_points(),
            "settle_seconds": self._settle_seconds,
            "settle_seconds_default": SETTLE_SECONDS,
            "min_share": self._min_share,
            "min_share_default": MIN_AREA_SHARE,
            "min_fill": MIN_FILL,
            # Said in the configuration rather than only in a docstring,
            # because the operator setting the number is the person who most
            # needs to know what is behind it — and, here, what is not.
            "settle_note": (
                "How long something has to stay put before it counts as being "
                "left there. This is a judgement, not a measured figure: a "
                "person pushing a cage through should not trip it at walking "
                "pace, and a pallet dropped in the lane should be reported "
                "while whoever dropped it is still nearby. Shorten it where "
                "the lane is quiet, lengthen it where traffic is constant."
            ),
            "share_note": (
                "How much of the marked walkway something must cover to count. "
                "On the warehouse clip this was measured against, a cardboard "
                "box covered 5.7-6.9% of the marked lane, so the 1.5% default "
                "has room under it. Raise it if floor marks and stains are "
                "being reported; lower it to catch smaller objects, at the "
                "cost of reporting scuffs."
            ),
        }

    def configure(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Save a drawn walkway, the wait, the smallest object, or all of them.

        Raises:
            ValueError: if the walkway could never enclose anything, or a
                setting is out of range. Refused rather than stored and then
                reported as ready.
        """
        changed: dict[str, Any] = {}

        if "settle_seconds" in payload:
            self._settle_seconds = positive(
                payload["settle_seconds"], "The wait", maximum=120.0
            )
            changed["settle_seconds"] = self._settle_seconds

        if "min_share" in payload:
            self._min_share = fraction(
                payload["min_share"], "The smallest object"
            )
            changed["min_share"] = self._min_share

        if "polygon" in payload:
            points = payload.get("polygon") or []

            if not points:
                walkway_manager.clear()
                changed["points"] = 0
            else:
                from app.camera import camera_manager

                changed["points"] = walkway_manager.save(
                    points,
                    source=camera_manager.current_source,
                    frame_width=payload.get("frame_width"),
                    frame_height=payload.get("frame_height"),
                )

            # A new walkway is a new question; the old one's timers say
            # nothing about it.
            self._candidates = []
            self._last_blocked = None
            self._last_seen = []

        if not changed:
            raise ValueError("Nothing to change.")

        return {"success": True, "message": "Settings updated.", **changed}


service = WalkwaysService()
