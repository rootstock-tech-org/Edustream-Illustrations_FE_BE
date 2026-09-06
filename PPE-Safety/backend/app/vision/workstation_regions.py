"""
Where the workstations are.

The same marked-out, named areas the doors use — see named_regions — asking
the opposite question. A door is watched for being open too long; a
workstation is watched for having nobody at it too long, so its own
threshold is time *empty* rather than time open.

Nothing is watched until an operator marks something. There is no sensible
way to guess where a workstation is: a desk, a packing bench and a machine
station look nothing alike, and "somewhere a person usually stands" is not
a thing a detector can find. So this module stays quiet until told what
matters.
"""

from pathlib import Path
from typing import Any, Optional

from app.core.validate import positive
from app.vision.named_regions import DUPLICATE_IOU, NamedRegions, clean_box, iou
from app.core.config import STORAGE_DIR

#: Resolved from the package root rather than the working directory.
#:
#: This was `Path("storage/...")`, which is relative to wherever the process
#: happened to start. Everything documented starts uvicorn from backend/, so it
#: landed in backend/storage and looked correct — but a server started from the
#: repository root read and wrote a second, empty store beside the first, and
#: an operator's marked regions were simply not there. app/core/config.py had
#: already solved this for the model weights, for the same reason.
REGIONS_FILE = STORAGE_DIR / "workstation_regions.json"

#: Longest allowance an operator may set, in seconds, here or module-wide.
#:
#: There was no ceiling at all, so 9999999 was accepted — eleven days, which
#: switches the absence alert off while the module goes on reporting itself
#: ready and configured. An alert that can be silenced by typing a big number
#: into a box marked "seconds" is worse than one that refuses the number. An
#: hour is far longer than any real allowance for an unattended bench and
#: still plainly means "wait", not "never".
#:
#: It lives here rather than beside the module default it caps because the
#: workstation service reaches into this module for the marked areas, so the
#: constant has to sit on this side of that arrow for both to share one
#: number. Setting the allowance on one bench is not a way round it.
MAX_EMPTY_SECONDS = 3600.0

#: How much of the smaller of two marked areas the other may cover before they
#: are the same workstation marked twice.
#:
#: The shared store refuses a duplicate on intersection over *union*, and that
#: measure quietly stops working as the two areas stop being the same size. A
#: small desk drawn entirely inside a large one shares all of itself and only a
#: fraction of the union, so it is accepted — and then one person sitting at
#: that desk is counted present at both workstations, and their being at the
#: small one holds off the large one's absence alert as well. False presence
#: silencing an alert is the failure this capability is built around.
#:
#: The number is the existing rule restated rather than a second opinion. Two
#: areas of equal size at the union bar of 0.55 share 71% of themselves —
#: 0.71 / (2 - 0.71) = 0.55 — so measuring that same 71% against the smaller
#: of the two is exactly today's answer wherever the two are alike, and stops
#: drifting where they are not. Nested is the case that matters and scores
#: 1.00; two benches side by side score 0.
#:
#: Asked only when an operator marks or moves something. A set already on disk
#: is left alone, like the area floor beside it: a rule arriving after the
#: drawing should not delete somebody's work on the next restart.
NESTED_SHARE = 0.71


def _shared(a: list[float], b: list[float]) -> float:
    """How much of the smaller of two boxes the other one covers, 0 to 1."""
    left = max(a[0], b[0])
    top = max(a[1], b[1])
    right = min(a[2], b[2])
    bottom = min(a[3], b[3])

    if right <= left or bottom <= top:
        return 0.0

    overlap = (right - left) * (bottom - top)
    smaller = min(
        max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1]),
        max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1]),
    )

    return overlap / smaller if smaller > 0 else 0.0


class WorkstationRegions(NamedRegions):
    """The marked workstations, per camera."""

    path = REGIONS_FILE
    noun = "workstation"
    threshold_field = "empty_seconds"

    def add(
        self, source: Any, box: Any, name: str = "", empty_seconds=None
    ) -> dict[str, Any]:
        """
        Mark a workstation.

        `empty_seconds` is how long this one may be left unattended before it
        is reported — a relief-covered line and a single-operator bench do
        not deserve the same allowance.

        Raises:
            ValueError: as the shared store does, and additionally when the
                area sits inside — or swallows — one already marked. See
                `NESTED_SHARE`.
        """
        clean = clean_box(box, self.noun, self.MIN_AREA)
        self._refuse_nested(source, clean)

        return super().add(source, clean, name, empty_seconds)

    def update(
        self, source: Any, region_id: int, changes: dict[str, Any]
    ) -> dict[str, Any]:
        """Move, resize, rename or re-threshold a marked workstation."""
        if "box" in changes:
            clean = clean_box(changes["box"], self.noun, self.MIN_AREA)
            self._refuse_nested(source, clean, ignore=int(region_id))
            changes = {**changes, "box": clean}

        return super().update(source, region_id, changes)

    def _refuse_nested(
        self, source: Any, clean: list[float], ignore: Optional[int] = None
    ) -> None:
        """
        Refuse an area that is one of the marked ones over again.

        Checked before the shared store's own overlap rule rather than inside
        it, because that rule lives in the base class two capabilities share
        and this reasoning is a workstation's: a doorway inside a doorway is
        somebody being careless, while a desk inside a desk quietly disables
        an absence alert.

        Only where that rule cannot see. Two areas the shared store already
        refuses are left to it, in its words — this is the part of the same
        idea that intersection over union stops reaching once the two areas
        are different sizes, not a second opinion about the ones it reaches.
        """
        for existing in self.for_source(source):
            if existing["id"] == ignore:
                continue

            if iou(clean, existing["box"]) >= DUPLICATE_IOU:
                continue

            share = _shared(clean, existing["box"])

            if share < NESTED_SHARE:
                continue

            them = existing["name"] or f"an existing {self.noun}"
            mine = (clean[2] - clean[0]) * (clean[3] - clean[1])
            theirs = (
                (existing["box"][2] - existing["box"][0])
                * (existing["box"][3] - existing["box"][1])
            )

            # Which way round it is, because the two need different actions:
            # one is a bench drawn inside a bay, the other a bay drawn over a
            # bench, and "that overlaps" leaves the operator guessing which
            # of the two rectangles on their screen to move.
            raise ValueError(
                f"That sits inside \"{them}\" — one person would be counted "
                f"at both. Move it clear, or delete that one first."
                if mine <= theirs
                else f"That covers \"{them}\" — one person would be counted "
                f"at both. Move it clear, or delete that one first."
            )

    @staticmethod
    def _clean_threshold(value: Any) -> Optional[float]:
        """
        One workstation's own allowance, or None to follow the module default.

        Same rules as the module default, deliberately: the shared version
        accepted anything above zero, so a per-bench allowance of 9999999
        seconds — or of NaN, which is not above zero and is not below it
        either — switched that bench's alert off while the module went on
        reporting itself ready. Setting the number on one bench cannot be a
        way round the ceiling that applies to all of them.
        """
        if value is None or value == "":
            return None

        return positive(value, "The allowed time", maximum=MAX_EMPTY_SECONDS)


workstation_regions = WorkstationRegions()
