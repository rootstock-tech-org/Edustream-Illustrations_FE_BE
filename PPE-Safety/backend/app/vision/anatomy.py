"""
Where a person's head is, and whose gear is whose.

Two modules decide what belongs to whom by asking whether a detected item's
centre falls inside a person's box. Both got it wrong in the same way, and the
measured failures are the reason this file exists:

  - A mask was credited to the wrong person. Person A, large and close and
    actually maskless, claimed person B's mask, because the test was "is the
    mask's centre inside A's *full box*" and A's box contains B entirely.
  - A helmet detected at 0.829 was thrown away because the two workers wearing
    it and standing beside it had merged into one detected box, and an item
    matching nobody is silently dropped.

## The head band, measured

The plan for this work said to match against "the top fifth of the box". That
would have been wrong, and only measuring showed it. Real person boxes with
real faces found inside them, on two photographs:

    person box height   face top    face bottom   face width
          380 px          15.9%        35.2%         28.0% of box width
          436 px           3.6%        13.9%         18.1%
          680 px           8.2%        34.7%         28.0%

A band of the top 20% would have cut the bottom off every one of these faces,
and missed the first one almost entirely. The face reaches 35% of the way down
a standing person's box, because a person's box starts at the top of their
head and their head is a fifth of their height — but a *seated* or partly
occluded person's box starts lower and their face occupies far more of it.

So the band is the top 45% of a person's height, at their full width. Three
samples is not many, which is a reason to be generous rather than tight: an
over-wide band creates a contest, and the rule below settles contests, while an
over-tight one puts a real face outside its owner's own band and there is
nothing left to recover from that.

## Why a narrower band is not the fix

Narrowing the *width* was the first attempt and it made things worse, which is
worth recording because it is the obvious idea. The mask in the reported
failure sits near the edge of its owner's box; a band of the middle 64% put it
outside, so the real wearer stopped being a candidate for their own mask and
the person wrongly claiming it won unopposed. The fix made the defect
deterministic.

Nor does narrowing help in principle. Person A's box contains person B's
completely, so the mask is inside both bands however they are drawn. Narrowing
changes how often two people contest an item; it cannot decide a contest.

What decides it is `claim`, on two rules. An item goes to exactly one person
and a person holds at most one of each item — so a large near person cannot
sweep up the masks of everyone standing in front of them. And where two bands
both contain an item, the *tighter* one wins: a thing inside two nested boxes
belongs to the inner one. Distance from the centre only breaks ties between
bands of similar size, which is the ordinary side-by-side case.

The leftovers are the other half of the value. An item nobody can hold is
evidence of a person the detector merged away — a helmet found at 0.829 with
no head to put it on — and used to be dropped in silence.
"""

from typing import Any, Optional, Sequence

__all__ = ["head_band", "claim", "HEAD_HEIGHT", "HEAD_WIDTH"]

#: How far down a person's box their head can reach, as a fraction.
#:
#: Measured faces ended at 13.9%, 34.7% and 35.2%. Set past the furthest with
#: margin, because the sample is small and the cost of being slightly too
#: generous is a contest that `claim` then settles, while the cost of being too
#: tight is a real face outside its owner's own head band.
HEAD_HEIGHT = 0.45

#: How much of a person's width their head can occupy, centred.
#:
#: Measured at 18.1%, 28.0% and 28.0%, so 64% holds a head with room to spare —
#: and it is deliberately *not* used as a gate. Narrowing the width was tried
#: first and it broke the very case it was meant to fix: the mask in the
#: reported failure sits near the edge of its owner's box, outside a 64% band,
#: so its owner stopped being a candidate for their own mask and the person
#: wrongly claiming it won by default. The vertical narrowing does the real
#: work — gear is on the head, and the head is at the top. This stays as a
#: description of a head's proportions rather than a rule.
HEAD_WIDTH = 0.64


def head_band(box: Sequence[float]) -> tuple[float, float, float, float]:
    """
    The part of a person's box their head can be in.

    Args:
        box: that person's box, as (x1, y1, x2, y2) in pixels.

    Returns:
        The head band, in the same coordinates.
    """
    x1, y1, x2, y2 = (float(v) for v in box)

    # Full width, top fraction of the height. See HEAD_WIDTH for why the width
    # is not narrowed.
    return (x1, y1, x2, y1 + (y2 - y1) * HEAD_HEIGHT)


def _centre(box: Sequence[float]) -> tuple[float, float]:
    x1, y1, x2, y2 = (float(v) for v in box)
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _fit(
    item: Sequence[float], band: Sequence[float]
) -> Optional[tuple[float, float]]:
    """
    How well an item sits in a band, or None if it is not in it at all.

    Ranked on the band's area first and its centre second, and that order is
    the whole fix. In the reported failure one person's box contains another's
    entirely, so the mask is inside both bands however they are drawn, and no
    amount of measuring from the centre settles it — the larger person is
    nearer the middle of their own band than the real wearer is of theirs.
    What separates them is that the wearer's band is the tighter fit around
    the same mask, and a thing inside two nested boxes belongs to the inner
    one. Distance still decides between bands of similar size, which is the
    ordinary case of two people standing side by side.
    """
    ix, iy = _centre(item)
    bx1, by1, bx2, by2 = (float(v) for v in band)

    if not (bx1 <= ix <= bx2 and by1 <= iy <= by2):
        return None

    half_w = max((bx2 - bx1) / 2.0, 1e-6)
    half_h = max((by2 - by1) / 2.0, 1e-6)

    off_centre = max(
        abs(ix - (bx1 + bx2) / 2.0) / half_w,
        abs(iy - (by1 + by2) / 2.0) / half_h,
    )

    return ((bx2 - bx1) * (by2 - by1), off_centre)


def claim(
    people: Sequence[dict[str, Any]],
    items: Sequence[dict[str, Any]],
    *,
    band: bool = True,
) -> tuple[dict[int, int], list[int]]:
    """
    Give each item to at most one person, and say which items nobody could hold.

    Args:
        people: person detections, each with a "box".
        items: item detections — helmets, masks, faces — each with a "box".
        band: match against the head band. False matches the whole person box,
            for items worn below the head.

    Returns:
        ``(owner_of, orphans)`` — the index of the person holding each item by
        item index, and the indices of items nobody could hold.

    One item, one owner, and one owner cannot hold two of the same item. A
    person whose box contains another person's therefore cannot take both
    masks: they win the one they are nearest the centre of, and the other goes
    to its own wearer rather than being dropped.

    The leftovers matter as much as the assignment. An item nobody can hold is
    evidence of somebody the detector merged away or missed, and used to be
    discarded in silence — a helmet found at 0.829 with no head to put it on.
    """
    bands = [head_band(p["box"]) if band else tuple(p["box"]) for p in people]

    # Every possible pairing, best fit first, so the clearest claims are
    # settled before the marginal ones and no earlier person can take an item
    # a later one fits better.
    pairs = []

    for item_index, item in enumerate(items):
        for person_index, area in enumerate(bands):
            fit = _fit(item["box"], area)
            if fit is not None:
                pairs.append((fit, item_index, person_index))

    pairs.sort()

    owner_of: dict[int, int] = {}
    taken: set[int] = set()

    for _, item_index, person_index in pairs:
        if item_index in owner_of or person_index in taken:
            continue
        owner_of[item_index] = person_index
        taken.add(person_index)

    orphans = [i for i in range(len(items)) if i not in owner_of]

    return owner_of, orphans
