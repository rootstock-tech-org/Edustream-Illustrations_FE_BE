from app.domain.physical_design.sizing import (
    DEFAULT_DIE_HEIGHT_UM,
    DEFAULT_DIE_WIDTH_UM,
    choose_die_sizing,
)


def test_smallest_calibrated_design_uses_the_verified_default() -> None:
    decision = choose_die_sizing(component_count=3)

    assert decision.die_width_um == DEFAULT_DIE_WIDTH_UM
    assert decision.die_height_um == DEFAULT_DIE_HEIGHT_UM
    assert decision.is_calibrated is True


def test_mux_sized_design_uses_the_verified_default() -> None:
    decision = choose_die_sizing(component_count=8)  # mux_2to1_document has 8 components

    assert decision.is_calibrated is True
    assert decision.die_width_um == DEFAULT_DIE_WIDTH_UM


def test_largest_calibrated_design_is_still_calibrated() -> None:
    decision = choose_die_sizing(component_count=16)  # the tested large10 ceiling

    assert decision.is_calibrated is True


def test_beyond_calibrated_ceiling_is_explicitly_flagged_not_silently_reused() -> None:
    decision = choose_die_sizing(component_count=17)

    assert decision.is_calibrated is False
    assert "exceeds the calibrated ceiling" in decision.note


def test_sizing_is_deterministic() -> None:
    first = choose_die_sizing(component_count=5)
    second = choose_die_sizing(component_count=5)

    assert first == second
