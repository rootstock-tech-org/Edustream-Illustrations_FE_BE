"""
Can the camera see this part of the picture at all?

Every judgement in this system rests on an unstated assumption: that the
camera can actually see the thing being judged. When something is held
against the lens that assumption quietly fails, and the failure is worse
than a wrong answer — a covered camera looks exactly like a calm scene.
An operator holding a palm over the lens was shown a workstation drawn
green and the word "clear".

The test here does not ask what is covering the lens. It asks whether the
picture carries detail *for its own brightness*, which is what a covered lens
destroys whatever is doing the covering — a hand, tape, paint, a stacked
pallet, a spider's web, or a camera knocked out of focus.

## Why "for its own brightness"

The first version compared the Laplacian variance of the raw pixels against a
fixed constant, and claimed here that "office, site, dim light, soft focus"
all came in at 0% without detail. That claim was disproved with this same
code and a real construction-site frame with nothing changed but its
brightness:

    x0.50   mean 47.9/255   blind 0.250   not obstructed
    x0.45   mean 42.9/255   blind 0.312   not obstructed
    x0.40   mean 38.1/255   blind 0.625   OBSTRUCTED   <- an ordinary dim room
    x0.25   mean 23.7/255   blind 0.875   obstructed

Halving the light halves every edge in the picture and the variance of the
Laplacian falls with the square of it, so dimming and covering look alike to
a fixed bar. That is expensive here in a way it would not be elsewhere: a
workstation believed blocked has its absence clock held, so being wrong
suspends absence monitoring for as long as the room stays dim — the night
shift, which is also when a supervisor is least likely to notice an empty
post unaided.

So the patch is stretched to a reference contrast before it is measured. The
same frames, and six other real scenes, now read 0.000 at every brightness
down to 6% of daylight, while every real obstruction still reads 0.875-1.000:

    site x1.00 / x0.40 / x0.17 / x0.10 / x0.06 ......  0.000 at every step
    office, stillcam, site photograph, same sweep ....  0.000 at every step
    a palm over the lens ............................  1.000
    a palm over the lens in a dim room ..............  1.000
    a real skin crop against the lens ...............  1.000
    lens badly out of focus (blur k=41) .............  0.875
    solid black / white / grey / blue ...............  1.000

Darkness on its own is no longer this module's answer to give. A room too
dark to judge is unreadable — see app/vision/legibility.py — which is a
different and more useful thing to tell an operator than "something is over
the lens".

## Why the small blur

Normalising amplifies whatever the patch has, and grain is not detail:
without the blur, a covered lens with sensor noise behind it reads as a
detailed picture. Measured on a palm over the lens with noise added:

    noise sigma                0      1      2      3      5
    raw Laplacian (before)   1.000  0.000  0.000  0.000  0.000
    normalised, no blur      1.000  0.000  0.000  0.000  0.000
    normalised + blur        1.000  1.000  0.938  0.000  0.000
    the same, through jpeg   1.000  1.000  1.000  0.938  0.000

The last row is the honest one for a camera: a stream is compressed before it
reaches us and compression removes most of that grain. Past about sigma 5 of
uncompressed grain no version of this test sees the obstruction, and it does
not pretend to.

Deliberately model-independent. Asking a detector "is this a person" cannot
answer this, because the person holding their hand up is genuinely there —
the detector is right, and the answer is still useless.
"""

import cv2
import numpy as np

#: Variance of the Laplacian below which a patch carries no usable detail —
#: measured after the patch is stretched to a reference contrast and lightly
#: smoothed, so it is a statement about structure rather than about how much
#: light there was.
#:
#: Chosen from the gap, not from theory: real scenes at every brightness from
#: full daylight to 6% of it score far above this bar, palms and solid colours
#: far below, and nothing measured landed near it.
FLAT_VARIANCE = 3.0

#: The narrowest spread of brightness a patch is credited with, in levels of
#: 255, when it is normalised.
#:
#: The gain is 255/spread, so without a floor a featureless patch would be
#: multiplied by hundreds and its grain would become "detail" — precisely the
#: answer this module exists to refuse. Twenty-four levels caps the gain near
#: ten: enough to rescue a room at 6% of daylight, not enough to rescue a hand.
MIN_RANGE = 24.0

#: How finely a region is divided when looking for detail. Cells rather than
#: the whole patch, so a region half-covered by a hand still registers as
#: half blind instead of averaging out to "fine".
GRID = 4

#: Share of a region without detail past which it cannot be judged.
#:
#: Measured: every visible scene comes in at 0.000-0.125, a palm covering the
#: region at 0.875 or more. Half is open water between them.
BLIND_THRESHOLD = 0.5


def _normalised(grey: np.ndarray) -> np.ndarray:
    """
    The patch stretched to a reference contrast, so what follows measures
    structure rather than illumination.

    Percentiles rather than the extremes: one blown highlight or one dead
    pixel must not set the scale for everything else.
    """
    # Sampled on every second pixel once the patch is large. The distribution
    # is the same and the work is a quarter of it, which matters because this
    # runs for every marked workstation on every frame — 18ms of the 36ms a
    # full-1080p region cost, before this.
    sample = grey[::2, ::2] if grey.size > 250_000 else grey

    low, high = np.percentile(sample, (2, 98))
    gain = 255.0 / max(float(high - low), MIN_RANGE)

    return grey.astype(np.float64) * gain


def _detail(cell: np.ndarray) -> float:
    """
    How much structure a normalised cell carries.

    The blur comes first because the gain applies to grain as well as to
    edges, and a single-pixel speckle is not something the camera can see
    the workstation through.
    """
    return float(cv2.Laplacian(cv2.GaussianBlur(cell, (3, 3), 0), cv2.CV_64F).var())


def blind_share(patch: np.ndarray) -> float:
    """
    How much of this patch carries no detail, from 0.0 to 1.0.

    Args:
        patch: a region of the frame, in BGR (or already grey).

    Returns:
        The share of the patch's cells with no usable detail. An empty or
        unusably small patch counts as fully blind — nothing can be judged
        from it either.
    """
    if patch is None or patch.size == 0:
        return 1.0

    grey = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY) if patch.ndim == 3 else patch
    height, width = grey.shape

    # Once for the whole patch, not once per cell: a region half covered by a
    # hand must be measured against the contrast of the room it is in, so the
    # covered half stays blind instead of being stretched back into detail.
    scaled = _normalised(grey)

    if height < GRID * 4 or width < GRID * 4:
        # Too small to divide; judged whole.
        return 1.0 if _detail(scaled) < FLAT_VARIANCE else 0.0

    flat = 0

    for row in range(GRID):
        for column in range(GRID):
            cell = scaled[
                row * height // GRID:(row + 1) * height // GRID,
                column * width // GRID:(column + 1) * width // GRID,
            ]
            if _detail(cell) < FLAT_VARIANCE:
                flat += 1

    return flat / (GRID * GRID)


def is_obstructed(patch: np.ndarray, threshold: float = BLIND_THRESHOLD) -> bool:
    """Whether this part of the picture is too featureless to judge."""
    return blind_share(patch) >= threshold
