"""
Where the doors are.

Left to itself the model finds doors wherever it thinks it sees one, and
reports them with boxes that wander a little every frame. That is fine for
"is anything open right now" and useless for anything that has to survive a
restart: a door's identity was its position in a list, which reset every
session, so "Door 2" today was a different doorway tomorrow.

Marking inverts that. An operator marks each doorway once and names it, and
from then on those regions are what the module watches. The model is left
with the one question it is actually good at — is this doorway open or closed
— and stops being asked where the doorways are.

The storage, naming and per-door threshold are the general problem of areas
somebody drew, and live in named_regions. What is door-specific is here: the
question of which detection belongs to which marked doorway.
"""

from pathlib import Path
from typing import Any, Optional

from app.vision.named_regions import (  # noqa: F401  (re-exported)
    DUPLICATE_IOU,
    MAX_NAME,
    MIN_SIZE,
    NamedRegions,
    _clean_box,
    iou,
)
from app.core.config import STORAGE_DIR

#: Resolved from the package root rather than the working directory.
#:
#: This was `Path("storage/...")`, which is relative to wherever the process
#: happened to start. Everything documented starts uvicorn from backend/, so it
#: landed in backend/storage and looked correct — but a server started from the
#: repository root read and wrote a second, empty store beside the first, and
#: an operator's marked regions were simply not there. app/core/config.py had
#: already solved this for the model weights, for the same reason.
REGIONS_FILE = STORAGE_DIR / "door_regions.json"

#: Overlap needed before a detection is accepted as belonging to a region.
#:
#: Modest, because an operator draws generously around a doorway while the
#: model boxes the door leaf itself, so the two agree on position but not
#: always on extent. Best match wins regardless, so this only has to exclude
#: detections that are somewhere else entirely.
#:
#: The only overlap rule the door module has. There used to be a second one in
#: the service — a frame-to-frame identity threshold of 0.30 for doors the
#: model found by itself — which outlived the tracker that used it and sat
#: there disagreeing with this one for nobody's benefit.
MATCH_IOU = 0.25

#: How much of a detection must lie inside a marked region before the region
#: is held to *contain* that doorway, rather than merely to clip it.
#:
#: Used only to notice a marked box with two doorways in it, and measured
#: against both mistakes on the office footage, six frames a hundred apart. A
#: box drawn round two doorways held the second one at 0.803 to 1.000. A box
#: drawn round one doorway clipped its neighbours, and the most of a second
#: doorway it ever held was 0.633 — three boxes at 0.611 to 0.633 on one
#: frame, which a bar of 0.60 would have reported as three doorways in a
#: single-door box. The gap is [0.633, 0.803] and this sits in it.
#:
#: Erring high on purpose: the cost of missing the warning is that the module
#: goes on doing what it does today, and the cost of raising it wrongly is
#: telling an operator their correct marking is wrong.
CONTAINED_IN_REGION = 0.70

#: Smallest believable door, as a fraction of the picture's area.
#:
#: Measured before it was set: across the office footage every real door
#: occupies at least 1.9% of the frame, so half that is a comfortable floor.
#: What it removes is the slivers — a door fragment at the frame's edge, a
#: door-coloured cabinet — which otherwise mint tracked doors with timers
#: that alert on furniture.
#:
#: Lives here rather than beside the detection loop that applies it because
#: MIN_AREA below is derived from the two constants around it. Written as
#: prose in another file, that derivation would go quietly stale the first
#: time somebody retuned one of the numbers.
MIN_DOOR_AREA = 0.008

#: Smallest door the model has actually been seen to report, as a fraction of
#: the picture's area.
#:
#: Not a policy, an observation: every fifth frame of the office clip was run
#: through the shipped weights and the door boxes measured 1.9% to 7.7% of the
#: frame. MIN_DOOR_AREA above is the smallest box the service will *tolerate*,
#: set below this on purpose to leave headroom; this is the smallest box it has
#: ever had to handle. MIN_AREA is derived from this one, because a region has
#: to be able to match a doorway that exists rather than one that could exist
#: arithmetically.
SMALLEST_OBSERVED_DOOR = 0.019

#: Longest allowance an operator may set on a door, in seconds.
#:
#: There was no ceiling at all, and `open_seconds: 999999` was accepted — an
#: eleven-day grace period, which switches the alert off while the module goes
#: on reporting itself configured and ready. An hour is already far longer than
#: any doorway this watches plausibly needs. Past that an operator does not
#: want a longer wait, they want the door off the list, and that is a different
#: action with a different button.
#:
#: Here rather than in the service so the same number bounds both the module
#: default and a per-door override — a per-door threshold is not a way round
#: the module's own limit.
MAX_OPEN_SECONDS = 3600.0


class DoorRegions(NamedRegions):
    """The marked doorways, per camera."""

    path = REGIONS_FILE
    noun = "door"
    threshold_field = "open_seconds"

    #: Smallest region worth marking, as a fraction of the picture's area.
    #: Derived, not chosen.
    #:
    #: `match()` below needs an overlap of MATCH_IOU between the region and a
    #: detection. A region of area `r` scores at best `r / d` against a
    #: detection of area `d`: that is the case where the detection swallows the
    #: region whole, and nothing can beat it, because the intersection cannot
    #: exceed `r` and the union cannot fall below `d`. So a region can only
    #: match doors up to `r / MATCH_IOU` in size, and to match a door of area
    #: `d` at all it must be at least `MATCH_IOU * d`.
    #:
    #: The `d` that matters is the smallest door the model actually reports —
    #:
    #:     MATCH_IOU * SMALLEST_OBSERVED_DOOR  =  0.25 * 0.019  =  0.00475
    #:
    #: — and not the smallest detection the service will tolerate. Deriving it
    #: from MIN_DOOR_AREA instead gives 0.25 x 0.008 = 0.002, and that floor
    #: guarantees nothing: a region sitting on it can only match a detection of
    #: 0.8% of frame or less, which is smaller than any door ever seen, so it
    #: still reads "not seen yet" for ever in front of a real doorway. It only
    #: moved the dead band from [0.0004, 0.002) to [0.002, 0.00475) instead of
    #: closing it. A floor derived from a door that cannot occur is not a
    #: floor.
    #:
    #: What MIN_SIZE alone admitted was 0.02 x 0.02 = 0.0004 — twelve times
    #: under this, best possible IoU 0.05 against a bar of 0.25, `match()`
    #: returning None every frame for ever. Marked, watched, never seen, and no
    #: error raised at any point to say why.
    #:
    #: Taken up from 0.00475 to a round half a percent, because a region
    #: sitting exactly on the derived value *ties* the bar against that door
    #: rather than clearing it — and measured, the tie lands an ulp under
    #: (0.24999999999999994 against 0.25), so `match()` returns None. A floor
    #: the smallest real door can only tie is the same defect one decimal place
    #: further along. At 0.005 that region scores 0.263 against a 1.9% door and
    #: 0.625 against the smallest detection the service will keep.
    #:
    #: This costs an operator nothing they would really draw: doors on the
    #: office footage measure 1.9% to 7.7% of the frame, so the smallest real
    #: doorway is still nearly four times over the floor.
    MIN_AREA = 0.005

    #: A per-door allowance gets the module's ceiling, not a free hand. Setting
    #: one door's grace period to 999999 seconds would switch that door's alert
    #: off just as thoroughly as setting the module default to it, and it is
    #: the quieter of the two places to do it.
    MAX_THRESHOLD = MAX_OPEN_SECONDS

    def add(
        self, source: Any, box: Any, name: str = "", open_seconds=None
    ) -> dict[str, Any]:
        """Mark a doorway. `open_seconds` is this door's own allowance."""
        return super().add(source, box, name, open_seconds)

    def match(
        self, region_box: list[float], detections: list[dict[str, Any]]
    ) -> Optional[int]:
        """
        Index of the detection that best fills this region, or None.

        Best overlap wins rather than first past the threshold: two doorways
        side by side will both partly overlap a generously drawn region, and
        taking whichever came first out of the model would assign them at
        random.

        One region asked on its own, which is the whole of the question only
        when there is one region. `assign` is the general answer and this is
        it applied to a list of one, so the two cannot drift apart.
        """
        return self.assign([region_box], detections).get(0)

    @staticmethod
    def assign(
        region_boxes: list[list[float]], detections: list[dict[str, Any]]
    ) -> dict[int, int]:
        """
        Which detection belongs to which marked doorway — one each, at most.

        Args:
            region_boxes: the marked doorways, in the order they are watched.
            detections: this frame's doors, each with a "box" in the same
                fractions of the picture.

        Returns:
            ``{region index: detection index}``, leaving out any region
            nothing was found for.

        Matching used to be asked one region at a time, and each answer was
        right on its own: a detection that clears the bar against two regions
        was handed to both. On the reference footage the left wooden door and
        the glass door beside it sit close enough for one box across the
        boundary to score 0.326 against each, and both marked doorways then
        reported the same state, from the same box, at the same moment — two
        doors' worth of open/closed events, and two timers escalating in step,
        off one physical door.

        A door is one thing and belongs in one place, so the pairings are
        ranked by overlap and taken best first: the clearest claims are
        settled before the marginal ones, and no region can take a detection
        that another region fits better. The same shape of rule as
        `vision.anatomy.claim`, which settles whose helmet is whose — that
        code could not be reused because it decides containment by an item's
        centre landing in a person's box, and a door is decided on overlap
        against a bar the region's own minimum size is derived from.

        Equal scores are broken by the order the doorways were marked in,
        which is arbitrary but the same every frame — a doorway that cannot
        be told from its neighbour must at least not alternate between them.
        """
        pairs = []

        for region_index, region_box in enumerate(region_boxes):
            for index, detection in enumerate(detections):
                score = iou(region_box, detection["box"])
                if score >= MATCH_IOU:
                    pairs.append((-score, region_index, index))

        pairs.sort()

        assigned: dict[int, int] = {}
        taken: set[int] = set()

        for _, region_index, index in pairs:
            if region_index in assigned or index in taken:
                continue
            assigned[region_index] = index
            taken.add(index)

        return assigned

    @staticmethod
    def doorways_in(
        region_box: list[float],
        detections: list[dict[str, Any]],
        ignore: Any = (),
    ) -> int:
        """
        How many separate doorways one marked region has inside it.

        Args:
            region_box: the marked doorway.
            detections: this frame's doors.
            ignore: indices of detections another region has already been
                given, so a generously drawn box is not accused of containing
                its neighbour's door as well as its own.

        Returns:
            The count. Two or more means the region was drawn round more than
            one doorway, and the module can only ever report one of them.

        `assign` above gives a region its best detection and stops. That is
        the right answer to "which door is this" and no answer at all to "how
        many doors did they draw round", so a box marked across two doorways
        tracked one of them and said nothing about the other — the second
        doorway could stand open all day inside a region reporting closed.

        Boxes are counted largest first, and a box overlapping one already
        counted by more than the matching bar is the same doorway seen twice
        rather than another one: if two boxes are closer to each other than a
        box has to be to a region to *be* that region's door, they cannot be
        two doors. Reusing that bar rather than inventing another number is
        deliberate — three constants for one apparent job is how DOOR-08 was
        read as a three-way disagreement.
        """
        ignored = set(ignore)

        counted: list[list[float]] = []

        boxes = sorted(
            (
                detection["box"]
                for index, detection in enumerate(detections)
                if index not in ignored
            ),
            key=lambda box: (box[2] - box[0]) * (box[3] - box[1]),
            reverse=True,
        )

        for box in boxes:
            area = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])

            if area <= 0:
                continue

            left = max(region_box[0], box[0])
            top = max(region_box[1], box[1])
            right = min(region_box[2], box[2])
            bottom = min(region_box[3], box[3])

            if right <= left or bottom <= top:
                continue

            if (right - left) * (bottom - top) / area < CONTAINED_IN_REGION:
                continue

            if any(iou(box, other) >= MATCH_IOU for other in counted):
                continue

            counted.append(box)

        return len(counted)


door_regions = DoorRegions()
