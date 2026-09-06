"""
Can this picture be judged at all?

Every capability in this system fails the same way. Dim the room, blur the
lens, or compress the stream, and people stop being detected — not
misjudged, *lost*. A scene with nobody in it then renders on every screen we
ship as a calm, green, everything-is-fine state. The measured cliff is one
percentage point wide: at 17% of daylight the system reports "1 without a
helmet", and at 16% it reports "Wearing the right gear".

That is the wrong direction for a safety product, and it is the same defect in
four capabilities, so the question is asked once, here.

This does not try to say whether a *particular* person was missed — nothing
cheap can. It says whether the picture is inside the range where detection was
measured to work. Outside it, a module should report that it cannot judge
rather than that everything is fine.

## Where the numbers come from

Measured against the person detector on two real frames — a site photograph
with three workers, one of them distant and plainly dressed, and an office
desk with one near figure. Each was degraded until the detector started losing
people, recording both the loss and the picture measures at each step.

    condition          brightness  contrast  sharpness  blockiness  people
    site, baseline          125.3      58.4      249.2       1.208     3/3
    site, x0.50              62.4      29.2       63.9           —     3/3
    site, x0.35              43.4      20.4       32.3           —     2/3  <-
    site, blur k=9          125.3      55.5       15.0       1.09*     3/3
    site, blur k=11         125.3      54.9       10.4       1.080     2/3  <-
    site, jpeg q=30         125.3      58.4      246.0       1.716     3/3
    site, jpeg q=21         125.3      58.4      255.2       1.904     2/3  <-

Two things that measurement settled, both of which would have been guessed
wrong:

**Sharpness cannot see compression damage.** Laplacian variance *rises* as
JPEG quality falls — 249 at baseline, 302 at q=10, 400 at q=5 — because
blocking artefacts are edges. A gate built on sharpness alone would call a
q=5 frame the sharpest picture it had ever seen. Blockiness is measured
separately for that reason, and it moves the other way under blur, so the two
do not double-count.

**The best detection confidence is useless as a signal.** Across the whole
brightness sweep it never fell below 0.85, because the nearest person stays
easy while the distant one disappears. Whatever warns us has to be a property
of the picture, not of what the detector felt sure about.

## What this deliberately does not do

It does not catch a picture that is well lit, sharp and uncompressed but still
wrong — a lens pointed at a wall, a scene the model has never seen. It is a
floor, not a guarantee. And it is conservative by design: it will sometimes
call a picture unjudgeable that the detector would in fact have handled, which
costs an "unverified" where an "all clear" would have been right. That is the
cheap direction to be wrong in.
"""

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

__all__ = ["Reading", "Floors", "FLOORS", "read", "readable"]

#: Mean brightness, 0-255, below which people start being lost.
#:
#: The site frame lost its third worker between x0.50 (62.4) and x0.35 (43.4).
#: Set just above the loss, not at it: the point is to speak before the
#: detector goes quiet, not at the same moment.
MIN_BRIGHTNESS = 45.0

#: Standard deviation of brightness, below which the picture is too flat to
#: read. Tracks the same measurement — contrast 20.4 at the first loss.
MIN_CONTRAST = 21.0

#: Laplacian variance of a contrast-normalised picture, below which detail is
#: gone. Blur k=9 (26.7) still found everybody; k=11 (19.0) did not.
#:
#: Normalised, because raw Laplacian variance scales with signal amplitude and
#: therefore falls when a picture is merely dim: the same photograph reads 249
#: at full light and 11.5 at a fifth of it without a trace of blur. The first
#: version of this file used the raw figure, and dim pictures were reported as
#: "Too blurred to check" — a true verdict for the wrong reason, which sends an
#: operator to the lens when the answer is the light switch. Stretched to a
#: reference contrast first, the same sweep reads 406 to 493 — flat — while
#: blur still takes it from 122 down to 5.
MIN_SHARPNESS = 22.0

#: Ratio of edge energy on the 8x8 compression grid to edge energy off it.
#: 1.21 on an untouched frame, 1.90 where the detector started losing people,
#: 3.77 at quality 5. Under blur it falls to 1.03, so this fires on
#: compression alone.
MAX_BLOCKINESS = 1.80

#: Smallest patch worth measuring, in pixels. Below this the statistics are
#: noise: a 20-pixel crop of anything has a "contrast" that means nothing.
MIN_PIXELS = 400


@dataclass(frozen=True)
class Reading:
    """What the picture measures, and whether that is enough to judge it."""

    brightness: float
    contrast: float
    sharpness: float
    blockiness: float
    readable: bool
    #: Plain words for the operator, or None when the picture is fine.
    reason: Optional[str]

    def as_dict(self) -> dict:
        """For a result payload, rounded to what is worth reporting."""
        return {
            "readable": self.readable,
            "reason": self.reason,
            "brightness": round(self.brightness, 1),
            "contrast": round(self.contrast, 1),
            "sharpness": round(self.sharpness, 1),
            "blockiness": round(self.blockiness, 2),
        }


def _blockiness(grey: np.ndarray) -> float:
    """
    Edge energy on the compression grid against edge energy off it.

    A JPEG quantises 8x8 blocks independently, so as quality falls the block
    boundaries become visible steps. Comparing the two populations is scale
    free — a picture that is simply busy raises both.
    """
    if grey.shape[1] < 24:
        return 0.0

    steps = np.abs(np.diff(grey.astype(np.float32), axis=1))

    on_grid = steps[:, 7::8]
    off_grid = np.delete(steps, np.s_[7::8], axis=1)

    if off_grid.size == 0 or on_grid.size == 0:
        return 0.0

    off_mean = float(off_grid.mean())

    # A perfectly flat picture has no edges anywhere. That is a legibility
    # problem, but it is the contrast rule's to report, not this one's.
    return float(on_grid.mean() / off_mean) if off_mean > 0.01 else 0.0


def _sharpness(grey: np.ndarray) -> float:
    """
    How much fine detail survives, independent of how brightly it is lit.

    The percentile stretch is what makes it independent: taken raw, this
    measure cannot tell a blurred picture from a dark one, because both
    flatten the same gradients.
    """
    stretched = grey.astype(np.float32)

    low, high = np.percentile(stretched, (2, 98))

    # A floor on the range, so a genuinely flat picture is not amplified into
    # apparent detail. Contrast has its own rule; this one is about blur.
    stretched = (stretched - low) * (255.0 / max(float(high - low), 24.0))

    return float(
        cv2.Laplacian(np.clip(stretched, 0, 255).astype(np.uint8), cv2.CV_64F).var()
    )


@dataclass(frozen=True)
class Floors:
    """The levels below which one particular model stops being trusted."""

    brightness: float
    contrast: float
    sharpness: float
    blockiness: float


#: Floors per module, measured against the weights that module actually runs.
#:
#: The first version of this file had one set of floors for everybody, derived
#: from degrading frames until `yolov8n-seg.pt` at confidence 0.35 lost people.
#: No shipped module runs that configuration. Two agents found the consequence
#: independently and from opposite ends: Safety Gear was still correctly
#: reporting a missing helmet and vest at a brightness the shared gate closed
#: at, and the mask module went dark roughly four times earlier than its own
#: weights required. Measured across twenty-one quality levels it cost
#: twenty-four correct verdicts — an honest system that had stopped being a
#: useful one.
#:
#: Each brightness floor sits just above where that model's own person
#: detection was measured to fail on the reference photograph:
#:
#:     ppe.pt      holds to  14.6, fails at 12.1  -> 16
#:     mask.pt     holds to  12.1, fails at  9.6  -> 13
#:     gloves.pt   holds to   7.0, never failed   -> 10
#:     yolov8n-seg holds to   7.0, never failed   -> 10
#:
#: Sharpness is deliberately NOT per module. Safety Gear's detector loses the
#: plainly-dressed worker at a blur kernel of 3 — a softness no operator would
#: call blurred, and far too fine to gate on without calling most real camera
#: pictures unreadable. That is a weakness of the weights, not of the picture,
#: and the honest answer to it is a headcount-drop signal rather than a
#: threshold. Recorded here so the next person does not "fix" it by raising a
#: number until the symptom disappears.
#: Sharpness floors are measured the same way — where each model's own person
#: detection failed under blur, in normalised units:
#:
#:     yolov8n-seg  held k=9  (26.7), lost at k=11 (19.0)  -> 22
#:     mask.pt      held k=17 ( 9.4), lost at k=21 ( 7.2)  ->  9.5
#:     gloves.pt    never lost anybody                     ->  6
#:
#: The mask figure was wrong the first time and is worth keeping the record
#: of: it was written as "held k=21, lost at k=31", and mask.pt does not hold
#: at k=21 — it finds one of the two people there. A floor of 6 therefore
#: called a picture readable that the module had already lost somebody from,
#: and it reported "1 person without a mask" about the one who was left, with
#: nobody counted unverified. That is the exact defect this phase removed from
#: this module, reintroduced by a floor set from a misread measurement.
#:
#: 9.5 is the last level measured to hold rather than the midpoint of the gap
#: below it. The other floors here sit mid-gap, and the difference is untested
#: ground either way; on the module whose failure is accusing the person still
#: visible, the tested side is the right one to stand on. It costs nothing
#: measurable — every blur level mask judges correctly reads 14.1 or above.
#:     ppe.pt       lost the plain-clothed worker at k=3 (122.4)
#:
#: Safety Gear keeps the general floor rather than 122, and that is a stated
#: gap rather than an oversight: gating at 122 would call an ordinary softly
#: focused camera unreadable, and the thing actually failing is the weights.
#: The last two were measured after the first pass, because the coverage table
#: showed the same over-caution the per-module floors were introduced to fix,
#: still in place where nobody had measured:
#:
#:   restricted zone  kept the general blur floor while its own detector held
#:                    every person to a kernel of 31 — nine correct verdicts
#:                    traded for "unverified" at levels it could see fine.
#:   face             had no floors at all and fell back to the strictest set,
#:                    losing fifteen of twenty correct verdicts. It is the most
#:                    robust model in the system: the debug report measured it
#:                    matching at 0.86 in near-darkness (mean pixel 4.3), through
#:                    JPEG quality 5, and to a blur kernel of 27.
FLOORS: dict[str, "Floors"] = {
    "ppe": Floors(16.0, 8.0, 22.0, 1.80),
    "mask": Floors(13.0, 7.0, 9.5, 1.80),
    "gloves": Floors(10.0, 6.0, 6.0, 1.80),
    "restricted-zone": Floors(10.0, 6.0, 6.0, 1.80),
    # Inherited from restricted-zone rather than measured, and said so here
    # rather than left to look like a figure somebody established. Both watch
    # a whole scene for a large object rather than reading detail on a person,
    # so the shape of the question is the same — but the forklift weights have
    # never been swept across the quality levels the other floors came from,
    # and until they are this is a reasonable default and not a measurement.
    "vehicle-zone": Floors(10.0, 6.0, 6.0, 1.80),
    # Inherited from restricted-zone for the same reason as vehicle-zone, and
    # said so rather than left to look measured. It watches a whole scene for a
    # large object rather than reading detail on a person, so the shape of the
    # question matches — but the floor-appearance detector has never been swept
    # across the quality levels those floors came from.
    #
    # There is one thing worth knowing that is specific to it: this module
    # judges colour, not detail, so it is hurt less by blur than by anything
    # that shifts hue. It has its own second opinion for the case the picture
    # is legible but the marked strip is not floor — see `floor_readable` — so
    # a dark aisle fails here and a mis-marked one fails there.
    "walkways": Floors(10.0, 6.0, 6.0, 1.80),
    "workstation": Floors(10.0, 6.0, 6.0, 1.80),
    "face": Floors(6.0, 4.0, 5.0, 4.00),
}

#: For anything with no measurement of its own — doors and face recognition
#: judge no people, so there is no headcount to degrade until it breaks.
DEFAULT_FLOORS = Floors(MIN_BRIGHTNESS, MIN_CONTRAST, MIN_SHARPNESS, MAX_BLOCKINESS)


def read(picture: np.ndarray, module_id: Optional[str] = None) -> Reading:
    """
    Measure a picture, or a patch of one.

    Args:
        picture: a BGR image — a whole frame, or a crop around one person.
        module_id: whose floors to judge against. Omitted, the shared floors
            apply — which are the strictest, so an unnamed caller is never
            told a picture is fine that a named one would refuse.

    Returns:
        A `Reading`. A patch too small to measure is reported readable, with
        no reason: refusing to judge something on the basis of statistics that
        are themselves meaningless would be the same mistake in miniature.
    """
    if picture is None or picture.size == 0:
        return Reading(0.0, 0.0, 0.0, 0.0, False, "There is no picture to check.")

    grey = (
        cv2.cvtColor(picture, cv2.COLOR_BGR2GRAY)
        if picture.ndim == 3
        else picture
    )

    brightness = float(grey.mean())
    contrast = float(grey.std())
    sharpness = _sharpness(grey)
    blocks = _blockiness(grey)

    if grey.size < MIN_PIXELS:
        return Reading(brightness, contrast, sharpness, blocks, True, None)

    # Ordered by how badly each one misleads. Darkness first: it is the
    # failure that produced a false "wearing the right gear" one percentage
    # point of brightness away from a correct alert.
    floors = FLOORS.get(module_id or "", DEFAULT_FLOORS)

    reason = None

    if brightness < floors.brightness:
        reason = "Too dark to check."
    elif contrast < floors.contrast:
        reason = "Too flat to check — almost no detail in the picture."
    elif sharpness < floors.sharpness:
        reason = "Too blurred to check."
    elif blocks > floors.blockiness:
        reason = "Picture quality too low to check."

    return Reading(brightness, contrast, sharpness, blocks, reason is None, reason)


def readable(picture: np.ndarray, module_id: Optional[str] = None) -> bool:
    """Whether `picture` is inside the range where detection was measured to work."""
    return read(picture, module_id).readable
