"""Behavioral simulation tests for DFF reset support (Step 22): sync vs
async timing, active-high vs active-low polarity, and the "UNKNOWN reset
is never active" safety rule, in
app.domain.simulation.sequential_engine.simulate_sequential.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.ir.models import (
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
    ResetPolarity,
    ResetSpec,
    ResetTiming,
)
from app.domain.simulation.models import LogicValue
from app.domain.simulation.sequential_engine import simulate_sequential

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _reset_dff_document(reset: ResetSpec) -> IRDocument:
    in_d = Component(
        id="in_d", kind="input", name="D_IN",
        ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    in_clk = Component(
        id="in_clk", kind="input", name="CLK_IN",
        ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1, type="clock")],
    )
    in_reset = Component(
        id="in_reset", kind="input", name="RESET_IN",
        ports=[Port(id="in_reset.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    dff1 = Component(
        id="dff1", kind="DFF", name="DFF1",
        ports=[
            Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
            Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1, type="clock"),
            Port(id="dff1.reset", name="reset", direction=PortDirection.INPUT, width=1),
            Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
        ],
        reset=reset,
    )
    out_q = Component(
        id="out_q", kind="output", name="Q_OUT",
        ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)],
    )

    return IRDocument(
        id="doc_dff_reset_sim",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Reset Simulation Test",
        components=[in_d, in_clk, in_reset, dff1, out_q],
        connections=[
            Connection(id="conn_d", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_clk", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_reset", source=ConnectionEndpoint(component_id="in_reset", port_id="in_reset.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.reset")),
            Connection(id="conn_q", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "in_reset", "dff1", "out_q"],
        provenance=_provenance(),
    )


def _q_value(result, timestep: int) -> LogicValue:
    step = result.timesteps[timestep]
    return next(s.value for s in step.signals if s.source_port_id == "dff1.q")


def test_asynchronous_active_high_reset_forces_q_zero_immediately_without_a_clk_edge() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.ASYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    stimulus = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO)],
        "in_reset.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE)],
    }

    result = simulate_sequential(document, stimulus=stimulus, num_timesteps=3)

    assert result.is_valid is True
    assert _q_value(result, 1) == LogicValue.ZERO
    assert _q_value(result, 2) == LogicValue.ZERO


def test_asynchronous_reset_wins_over_a_rising_clk_edge_while_still_asserted() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.ASYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    # timestep 0: clk low, reset asserted -> q forced to 0.
    # timestep 1: clk rises to 1 while reset STILL asserted -> q must stay
    #             0, never capture D (which is 1), because async reset wins.
    stimulus = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE)],
        "in_reset.out": [(0, LogicValue.ONE)],
    }

    result = simulate_sequential(document, stimulus=stimulus, num_timesteps=2)

    assert result.is_valid is True
    assert _q_value(result, 0) == LogicValue.ZERO
    assert _q_value(result, 1) == LogicValue.ZERO


def test_synchronous_reset_only_takes_effect_on_a_real_rising_clk_edge() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.SYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    # timestep 0: clk low, reset asserted, D high -> no edge yet, so a
    #             synchronous reset must NOT force q to 0 here (q stays at
    #             its initial power-on UNKNOWN value).
    # timestep 1: clk rises to 1 while reset is still asserted -> THIS is
    #             the real rising edge, so q must now become 0.
    stimulus = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE)],
        "in_reset.out": [(0, LogicValue.ONE)],
    }

    result = simulate_sequential(document, stimulus=stimulus, num_timesteps=2)

    assert result.is_valid is True
    assert _q_value(result, 0) == LogicValue.UNKNOWN
    assert _q_value(result, 1) == LogicValue.ZERO


def test_synchronous_reset_does_not_fire_on_a_falling_edge_or_a_held_level() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.SYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    # timestep 0: clk low (no edge yet - "prior clk" starts UNKNOWN, not
    #             ZERO, so this alone is never a rising edge).
    # timestep 1: clk rises 0->1, reset LOW, D=1 -> a REAL rising edge ->
    #             q captures 1.
    # timestep 2: clk falls (falling edge, not rising) while reset is
    #             asserted -> q must hold its previous value (1), never
    #             reset here, since sync reset only ever fires ON a
    #             rising edge.
    stimulus = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE), (2, LogicValue.ZERO)],
        "in_reset.out": [(0, LogicValue.ZERO), (2, LogicValue.ONE)],
    }

    result = simulate_sequential(document, stimulus=stimulus, num_timesteps=3)

    assert result.is_valid is True
    assert _q_value(result, 1) == LogicValue.ONE
    assert _q_value(result, 2) == LogicValue.ONE


def test_active_low_reset_is_asserted_by_a_zero_not_a_one() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_LOW, timing=ResetTiming.ASYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    # reset held HIGH (=1) the whole time - for active-low, this is
    # de-asserted, so D must drive q normally.
    stimulus_deasserted = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE)],
        "in_reset.out": [(0, LogicValue.ONE)],
    }

    deasserted_result = simulate_sequential(document, stimulus=stimulus_deasserted, num_timesteps=2)

    assert deasserted_result.is_valid is True
    assert _q_value(deasserted_result, 1) == LogicValue.ONE

    # A real ZERO on an active-low reset must force q to 0 immediately
    # (async), even with no clk edge at all.
    stimulus_asserted = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO)],
        "in_reset.out": [(0, LogicValue.ZERO)],
    }

    asserted_result = simulate_sequential(document, stimulus=stimulus_asserted, num_timesteps=1)

    assert asserted_result.is_valid is True
    assert _q_value(asserted_result, 0) == LogicValue.ZERO


def test_unknown_reset_value_is_never_treated_as_active() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.ASYNCHRONOUS)
    document = _reset_dff_document(reset_spec)

    # 'reset' is never given a stimulus value at all, so it stays
    # LogicValue.UNKNOWN throughout - this must never be treated as
    # asserted; D should drive q normally on the rising edge.
    stimulus = {
        "in_d.out": [(0, LogicValue.ONE)],
        "in_clk.out": [(0, LogicValue.ZERO), (1, LogicValue.ONE)],
    }

    result = simulate_sequential(document, stimulus=stimulus, num_timesteps=2)

    assert result.is_valid is True
    assert _q_value(result, 1) == LogicValue.ONE
