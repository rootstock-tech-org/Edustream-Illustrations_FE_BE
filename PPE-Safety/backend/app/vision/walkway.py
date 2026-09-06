"""
What is lying in a marked walkway that is not the walkway's own floor.

## Why this is not an object detector

The obvious build is to detect objects and ask whether one is in the marked
strip, and it was tried first. The COCO segmentation model this product
already loads was run over the operator's warehouse clip, and on the cardboard
box sitting in the middle of a marked aisle it reported nothing at all — while
naming a press brake a truck at 0.34, a pallet rack a suitcase at 0.29 and a
conveyor a bench at 0.24. Every detection was wrong and the one thing in the
picture that mattered was invisible to it.

That is not a tuning failure. The things that block a walkway are pallets,
drums, cages, spills, trolleys and cardboard, and a detector can only report
the classes it was taught. So this module does not ask what the object is. It
asks what is not floor, which needs no list of objects and is the question the
capability actually poses.

## How the floor is known without being shown a clear one

The first attempt learned the floor as one colour and its spread — a median
and a MAD per depth band — and flagged the yellow hatch markings as a single
enormous obstruction covering a third of the marked area. A walkway's floor is
not one colour. It is green epoxy *and* yellow hatching *and* a white line,
which is a multi-peaked distribution no median describes, and painted markings
are not an edge case here: they are what a walkway is marked out with.

The second attempt asked what was *rare* within each depth band, and found
nothing, for a reason that is arithmetic rather than tuning: the box fills
about a quarter of the band it stands in, so within that band it is not rare
under any threshold that leaves the white line alone.

What separates floor from obstruction is not colour and not rarity. It is
geography. Green epoxy, yellow hatching and the white line each appear along
the whole length of the marked strip; an obstruction appears in one place.
So the colours are binned, and a bin counts as floor when the pixels wearing
it are spread across the marked area rather than huddled in one corner of it.

Measured on the operator's own clip, with the box cut out only to check the
arithmetic: the box's three main colour bins scored 0.25, 0.31 and 0.35 for
spread, and every floor colour scored 0.58 to 0.95. That is the whole idea,
and the gap is wide.

An earlier version of this file grew the floor bins by one neighbour, so that
a colour straddling a bin edge was not called foreign for the half of it that
fell the other side. It took the floor set from 16 bins to 44 and swallowed
100% of the box: the detector reported clear floor on every frame of a clip
with an obstruction in the middle of it. The growth was never needed — a pixel
on the boundary between two floor colours lands in a bin whose own pixels are
spread along the walkway, because that boundary recurs everywhere the paint
does, so those bins pass on their own merit.

## What this cannot do

It cannot tell a pallet from a spill from a dropped coat, and does not claim
to — it reports that something is there, how much of the walkway it covers,
and where. It needs the marked strip to be mostly floor, which is what a
walkway is; mark a loading bay stacked with pallets and most of the marked
area is pallets, and the pallets become the floor. And it is blind to an
obstruction that happens to be the same colour as the floor it sits on.
"""

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

__all__ = ["Obstruction", "FloorModel", "read_floor", "find_obstructions"]


#: How finely chroma is divided when colours are counted.
#:
#: 24 bins across each of the two chroma axes — 576 in all. Fine enough that
#: cardboard and yellow floor paint land in different bins, which is the
#: closest pair measured on the operator's clip, and coarse enough that one
#: surface under a slightly uneven light stays in a handful of them.
CHROMA_BINS = 24

#: Chroma only. Lightness is deliberately not binned.
#:
#: An aisle is lit brighter at the end nearest the camera than at the far end,
#: often by a factor of two, and the same paint must not become two colours
#: because of it. Chroma survives that; lightness is exactly what does not.
#: This is also what makes a shadow falling across the walkway not an
#: obstruction — it darkens the floor without changing its colour.
USE_CHROMA_ONLY = True

#: How spread out a colour's pixels must be to count as floor.
#:
#: Measured as the root of the summed variance of position, against the same
#: figure for the whole marked area — so it does not care whether the walkway
#: runs across the picture or away from the camera.
#:
#: On the operator's clip:
#:
#:     the box's own colour bins        0.25, 0.31, 0.35
#:     every floor colour               0.58 - 0.95
#:
#: 0.45 sits in the gap between them with room on both sides.
FLOOR_SPREAD = 0.45

#: A colour too scarce for its spread to mean anything.
#:
#: Below this a bin holds a few hundred pixels of compression noise at a paint
#: edge, and the variance of a few hundred scattered pixels is not evidence of
#: anything. Such colours are treated as not-floor, which is the safe side:
#: they then have to survive the size and compactness tests below like any
#: other candidate, and a few hundred scattered pixels do not.
MIN_COLOUR_SHARE = 0.002

#: How far inside the drawn line the analysis starts, in pixels.
#:
#: The operator draws that line by hand, on a moving picture, with a mouse. The
#: pixels straddling it belong to neither the floor nor whatever is beyond it,
#: and left in they produced the one class of false alarm seen in testing: a
#: thin triangular sliver lying along the boundary, called an obstruction on
#: 205 frames of clear aisle.
EDGE_MARGIN = 9

#: How much of the marked walkway something must cover to be worth reporting.
#:
#: A scuff, a tyre mark or a leaf is not an obstruction. On the operator's clip
#: the box covers 5.7-6.9% of the marked area, so this is well under what a
#: real obstruction reads while still excluding marks on the floor.
MIN_AREA_SHARE = 0.015

#: How solid a blob must be — its area against its bounding box.
#:
#: This is what separates a real object from a sliver lying along the edge of
#: the marked area, and it is the setting the whole detector turns on. Swept
#: over every one of the 240 frames of the operator's clip, twice: once with
#: the walkway marked around the box, once with the clear aisle alongside it
#: marked instead.
#:
#:     floor   found on the box   false alarms on clear floor
#:      0.45      240 / 240              205 / 240
#:      0.55      239 / 240               12 / 240
#:      0.58      238 / 240                0 / 240
#:      0.60      238 / 240                0 / 240
#:      0.62      238 / 240                0 / 240
#:      0.65      237 / 240                0 / 240
#:      0.70       39 / 240                0 / 240
#:
#: The box's own blob measures 0.69 solid, so 0.70 is over a cliff — it is the
#: value at which this detector stops working, and it is 0.05 from the value
#: chosen. 0.60 sits in the middle of the measured clean band with margin on
#: both sides, and both sides were measured: a threshold set only against
#: false alarms cannot see what it costs, which is the mistake the vehicle
#: module's confidence floor was set with and had to be corrected for.
MIN_FILL = 0.60

#: Speckle removal, then joining. A real object survives the first and is made
#: whole by the second; compression noise at a paint edge survives neither.
OPEN_KERNEL = 5
CLOSE_KERNEL = 17

#: Below this there is not enough marked floor to learn a floor from.
MIN_MARKED_PIXELS = 5000


@dataclass(frozen=True)
class Obstruction:
    """Something in the marked walkway that is not its floor."""

    #: (x1, y1, x2, y2) in the picture's own pixels.
    box: tuple[int, int, int, int]

    #: How much of the marked walkway it covers, 0 to 1.
    share: float

    #: How solid it is — its area against its bounding box, 0 to 1.
    fill: float

    #: Its outline, for drawing. Simplified; may be empty.
    outline: list[tuple[int, int]]

    @property
    def centre(self) -> tuple[int, int]:
        x1, y1, x2, y2 = self.box
        return ((x1 + x2) // 2, (y1 + y2) // 2)


@dataclass(frozen=True)
class FloorModel:
    """The colours a marked walkway's own floor wears."""

    #: One entry per chroma bin: whether it is floor.
    floor: np.ndarray

    #: How much of the marked area each colour covers.
    shares: np.ndarray

    #: How spread out each colour is, against the marked area's own spread.
    spreads: np.ndarray

    @property
    def colours(self) -> int:
        """How many distinct colours the floor was found to wear."""
        return int(self.floor.sum())

    @property
    def usable(self) -> bool:
        """Whether anything in the marked area looks like floor at all."""
        return self.colours > 0


def _chroma_index(lab: np.ndarray) -> np.ndarray:
    """Every pixel's chroma bin, as a single number."""
    a = (lab[..., 1].astype(np.int32) * CHROMA_BINS) // 256
    b = (lab[..., 2].astype(np.int32) * CHROMA_BINS) // 256
    return a * CHROMA_BINS + b


def marked_area(
    polygon: np.ndarray,
    width: int,
    height: int,
    exclude: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    The floor to study: inside the drawn line, back from its edge, minus people.

    Args:
        polygon: the drawn area, in this picture's pixels.
        width, height: the picture's size.
        exclude: 0/255 mask of pixels to leave out — people, in practice.
            Removed before the floor is learned as well as before anything is
            looked for, so a worker's coat cannot become one of the colours
            the floor is then judged against.
    """
    area = np.zeros((height, width), np.uint8)
    cv2.fillPoly(area, [polygon], 255)

    area = cv2.erode(
        area, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (EDGE_MARGIN, EDGE_MARGIN))
    )

    if exclude is not None:
        area = cv2.bitwise_and(area, cv2.bitwise_not(exclude))

    return area


def read_floor(lab: np.ndarray, area: np.ndarray) -> FloorModel:
    """
    Which colours in the marked area are the walkway's own floor.

    A colour is floor when its pixels are spread across the marked area. See
    the module docstring: this is the whole idea, and it is what lets the floor
    be learned from a walkway that has something lying on it, with no clear
    reference picture and no assumption about what colour a floor is.
    """
    ys, xs = np.nonzero(area)
    total = len(ys)

    empty = np.zeros(CHROMA_BINS * CHROMA_BINS, bool)

    if total < MIN_MARKED_PIXELS:
        return FloorModel(empty, np.zeros_like(empty, float), np.zeros_like(empty, float))

    index = _chroma_index(lab[ys, xs])
    counts = np.bincount(index, minlength=CHROMA_BINS * CHROMA_BINS).astype(np.float64)
    held = counts > 0

    def variance(values: np.ndarray) -> np.ndarray:
        """Variance of a coordinate within each colour bin."""
        first = np.bincount(index, weights=values, minlength=CHROMA_BINS * CHROMA_BINS)
        second = np.bincount(
            index, weights=values * values, minlength=CHROMA_BINS * CHROMA_BINS
        )
        mean = np.divide(first, counts, out=np.zeros_like(first), where=held)
        mean_square = np.divide(second, counts, out=np.zeros_like(second), where=held)
        return np.maximum(mean_square - mean * mean, 0.0)

    spread = np.sqrt(
        variance(xs.astype(np.float64)) + variance(ys.astype(np.float64))
    )
    whole = float(np.sqrt(xs.var() + ys.var())) or 1.0

    shares = counts / total
    spreads = spread / whole

    return FloorModel(
        floor=(spreads >= FLOOR_SPREAD) & (shares >= MIN_COLOUR_SHARE),
        shares=shares,
        spreads=spreads,
    )


def find_obstructions(
    frame: np.ndarray,
    polygon: np.ndarray,
    exclude: Optional[np.ndarray] = None,
    min_share: float = MIN_AREA_SHARE,
) -> tuple[list[Obstruction], FloorModel, int]:
    """
    Everything in the marked walkway that is not its floor.

    Args:
        frame: BGR picture.
        polygon: the marked walkway, in this picture's pixels.
        exclude: 0/255 mask of pixels to ignore — people.
        min_share: how much of the walkway something must cover to be reported.

    Returns:
        (obstructions, floor_model, marked_pixels). An empty list with an
        unusable floor model means the question could not be answered, which
        the caller must not report as a clear walkway — see the module's
        `_summary`. An empty list with a usable one means the walkway is clear.
    """
    height, width = frame.shape[:2]
    area = marked_area(polygon, width, height, exclude)
    marked = int(cv2.countNonZero(area))

    lab = cv2.cvtColor(cv2.GaussianBlur(frame, (5, 5), 0), cv2.COLOR_BGR2Lab)
    floor = read_floor(lab, area)

    if not floor.usable or marked < MIN_MARKED_PIXELS:
        return [], floor, marked

    foreign = ((~floor.floor[_chroma_index(lab)]) & (area > 0)).astype(np.uint8) * 255

    foreign = cv2.morphologyEx(
        foreign,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (OPEN_KERNEL, OPEN_KERNEL)),
    )
    foreign = cv2.morphologyEx(
        foreign,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE_KERNEL, CLOSE_KERNEL)),
    )

    contours, _ = cv2.findContours(foreign, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    found = []
    for contour in contours:
        blob = cv2.contourArea(contour)
        share = blob / marked

        if share < min_share:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        fill = blob / float(w * h) if w and h else 0.0

        if fill < MIN_FILL:
            continue

        simplified = cv2.approxPolyDP(contour, 0.01 * cv2.arcLength(contour, True), True)

        found.append(
            Obstruction(
                box=(x, y, x + w, y + h),
                share=float(share),
                fill=float(fill),
                outline=[(int(p[0][0]), int(p[0][1])) for p in simplified]
                if len(simplified) >= 3
                else [],
            )
        )

    found.sort(key=lambda o: o.share, reverse=True)

    return found, floor, marked
