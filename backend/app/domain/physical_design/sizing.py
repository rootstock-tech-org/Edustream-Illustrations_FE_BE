"""Real, evidence-grounded die-sizing policy for Step 19's LibreLane runs.

NOT a formula - a deliberately conservative, BOUNDED policy, per the
pre-implementation calibration experiments (see repo memory): an absolute
300x300 micron die was verified (0 DRC/LVS errors, real PDN/placement/
routing succeeding) for every tested primitive-only circuit size from 1
gate up to a 7-gate/16-component tree. A 100x100 micron die was ALSO
verified working for the smallest (1-gate) case, proving the original
`PDN-0185` failure was specific to LibreLane's DEFAULT relative/10%-
utilization sizing (which produces an even smaller die for a tiny design),
not a hard floor at 100 microns.

This module deliberately does NOT extrapolate a scaling formula for
larger designs - that would require additional calibration experiments
never run. Anything above the verified component-count ceiling gets an
explicit, honest "uncalibrated" flag rather than silently reusing the same
constant.
"""

from __future__ import annotations

from dataclasses import dataclass

# The largest component count actually exercised by a real, successful
# LibreLane run during calibration (the 7-gate/16-component "large10" tree).
_CALIBRATED_MAX_COMPONENT_COUNT = 16

# Verified-safe absolute die dimensions (microns) for any primitive-only
# design at or below _CALIBRATED_MAX_COMPONENT_COUNT.
DEFAULT_DIE_WIDTH_UM = 300.0
DEFAULT_DIE_HEIGHT_UM = 300.0
DEFAULT_PL_TARGET_DENSITY = 0.30


@dataclass(frozen=True)
class DieSizingDecision:
    die_width_um: float
    die_height_um: float
    pl_target_density: float
    is_calibrated: bool
    note: str


def choose_die_sizing(component_count: int) -> DieSizingDecision:
    """Return the die sizing to use for a design with `component_count`
    total IR components (gates + input/output terminals).

    Never silently reuses the verified constant for an out-of-range size -
    `is_calibrated=False` signals the caller (the pipeline) should treat
    the result as a best-effort attempt, not a proven-safe configuration.
    """

    if component_count <= _CALIBRATED_MAX_COMPONENT_COUNT:
        return DieSizingDecision(
            die_width_um=DEFAULT_DIE_WIDTH_UM,
            die_height_um=DEFAULT_DIE_HEIGHT_UM,
            pl_target_density=DEFAULT_PL_TARGET_DENSITY,
            is_calibrated=True,
            note=(
                f"{DEFAULT_DIE_WIDTH_UM:.0f}x{DEFAULT_DIE_HEIGHT_UM:.0f}um "
                f"verified safe for designs up to {_CALIBRATED_MAX_COMPONENT_COUNT} "
                "components (real calibration runs, 0 DRC/LVS errors)."
            ),
        )

    return DieSizingDecision(
        die_width_um=DEFAULT_DIE_WIDTH_UM,
        die_height_um=DEFAULT_DIE_HEIGHT_UM,
        pl_target_density=DEFAULT_PL_TARGET_DENSITY,
        is_calibrated=False,
        note=(
            f"{component_count} components exceeds the calibrated ceiling of "
            f"{_CALIBRATED_MAX_COMPONENT_COUNT} - reusing the "
            f"{DEFAULT_DIE_WIDTH_UM:.0f}x{DEFAULT_DIE_HEIGHT_UM:.0f}um default as a "
            "best-effort attempt only. Real PDN/floorplan failure (e.g. PDN-0185) "
            "is possible and has not been ruled out for this size - this is not a "
            "proven-safe configuration."
        ),
    )
