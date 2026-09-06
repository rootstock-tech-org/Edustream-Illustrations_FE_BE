"""
Number checking for anything an operator can send us.

Every module parses configuration the same way — `float(payload[...])`, then a
range check — and every one of them had the same hole. Python's `json` module
accepts `NaN` and `Infinity`, which the JSON specification does not, so those
values arrive over the network as ordinary floats. `float("nan")` raises no
error, and every comparison against NaN is False, so a `value <= 0` guard waves
it straight through.

What that cost, measured: a door threshold of NaN made `_severity()` fall past
every escalation comparison and return "low", so every open door registered a
breach the instant it opened, regardless of how long it had been open. NaN box
coordinates passed through `min`/`max` clamping unchanged for the same reason,
leaving a marked doorway that could never match anything and would read "not
seen yet" for ever, with no error raised at any point.

Range and finiteness are checked in one place here so a module cannot check one
and forget the other.
"""

import math
from typing import Any, Optional

__all__ = ["finite", "positive", "fraction", "in_range"]


def finite(value: Any, name: str) -> float:
    """
    Read `value` as a real number.

    Args:
        value: whatever arrived in the payload.
        name: the field name, for the message the operator reads.

    Returns:
        The value as a float.

    Raises:
        ValueError: if it is not a number, or is NaN or infinite.
    """
    # Refused before float() sees it, because bool is a subclass of int in
    # Python and float(True) is 1.0 — so `{"min_person_height": true}` was
    # stored as a perfectly valid-looking 1.0, which is not what anybody
    # sending a boolean meant by it.
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number, not true or false")

    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a number") from exc

    if not math.isfinite(number):
        # Named rather than folded into "must be a number", because an operator
        # who sent NaN sent it from somewhere, and knowing which of the two
        # rules they broke is the difference between a fix and a guess.
        raise ValueError(f"{name} must be a real number, not {number}")

    return number


def in_range(
    value: Any,
    name: str,
    low: float,
    high: float,
    *,
    inclusive: bool = True,
) -> float:
    """
    Read `value` as a real number within `low`..`high`.

    Args:
        value: whatever arrived in the payload.
        name: the field name, for the message the operator reads.
        low, high: the permitted bounds.
        inclusive: whether the bounds themselves are allowed.

    Returns:
        The value as a float.

    Raises:
        ValueError: if it is not a real number, or falls outside the bounds.
    """
    number = finite(value, name)

    ok = low <= number <= high if inclusive else low < number < high

    if not ok:
        between = f"between {low} and {high}"
        raise ValueError(
            f"{name} must be {between}" if inclusive
            else f"{name} must be {between}, exclusive"
        )

    return number


def positive(value: Any, name: str, *, maximum: Optional[float] = None) -> float:
    """
    Read `value` as a number above zero, and optionally below a ceiling.

    The ceiling exists because nothing stopped an operator setting a door's
    grace period to 999999 seconds — eleven days — which silently disables the
    alert while the module goes on reporting itself configured and ready. An
    alert that can be turned off by typing a large number into a box labelled
    "seconds" is worse than one that refuses the number.

    Args:
        value: whatever arrived in the payload.
        name: the field name, for the message the operator reads.
        maximum: the largest value that still means something, if any.

    Returns:
        The value as a float.

    Raises:
        ValueError: if it is not a real number, is not above zero, or exceeds
            `maximum`.
    """
    number = finite(value, name)

    if number <= 0:
        raise ValueError(f"{name} must be greater than 0")

    if maximum is not None and number > maximum:
        raise ValueError(
            f"{name} must be {maximum:g} or less — "
            f"a longer wait than that switches the alert off rather than delaying it"
        )

    return number


def fraction(value: Any, name: str) -> float:
    """
    Read `value` as a fraction strictly between 0 and 1.

    For confidences and picture-relative sizes, where both ends are meaningless:
    a confidence of 0 accepts everything and 1 accepts nothing.

    Raises:
        ValueError: if it is not a real number strictly inside 0..1.
    """
    return in_range(value, name, 0.0, 1.0, inclusive=False)
