"""Correctness tests for app.domain.simulation.sequential_engine
(Step 21 follow-up #2: real behavioral simulation with time-stepping and
clock support for DFF). Each test drives simulate_sequential() with a
real, explicit ordered stimulus and multiple clock transitions - never a
single static input snapshot - so a hardcoded/fake implementation would
be detectably wrong.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.ir.examples import and_gate_document, dff_document, simple_inverter_document
from app.domain.ir.models import (
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)
from app.domain.simulation.models import LogicValue
from app.domain.simulation.sequential_engine import simulate_sequential

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _signal(result, port_id: str, timestep: int) -> LogicValue:
    step = result.timesteps[timestep]
    return next(s.value for s in step.signals if s.source_port_id == port_id)


def _two_dff_document() -> IRDocument:
    """Two independent DFFs sharing one clock but driven by different D
    inputs - hand-built (no two-DFF example exists in ir/examples.py),
    matching the existing convention of building extra fixtures locally
    in the test file (see test_engine.py's _or_gate_document)."""

    in_d1 = Component(
        id="in_d1", kind="input", name="D1_IN",
        ports=[Port(id="in_d1.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    in_d2 = Component(
        id="in_d2", kind="input", name="D2_IN",
        ports=[Port(id="in_d2.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    in_clk = Component(
        id="in_clk", kind="input", name="CLK_IN",
        ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1, type="clock")],
    )
    dff1 = Component(
        id="dff1", kind="DFF", name="DFF1",
        ports=[
            Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
            Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1, type="clock"),
            Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    dff2 = Component(
        id="dff2", kind="DFF", name="DFF2",
        ports=[
            Port(id="dff2.d", name="d", direction=PortDirection.INPUT, width=1),
            Port(id="dff2.clk", name="clk", direction=PortDirection.INPUT, width=1, type="clock"),
            Port(id="dff2.q", name="q", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_q1 = Component(
        id="out_q1", kind="output", name="Q1_OUT",
        ports=[Port(id="out_q1.in", name="in", direction=PortDirection.INPUT, width=1)],
    )
    out_q2 = Component(
        id="out_q2", kind="output", name="Q2_OUT",
        ports=[Port(id="out_q2.in", name="in", direction=PortDirection.INPUT, width=1)],
    )

    return IRDocument(
        id="doc_two_dff",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Two DFFs",
        components=[in_d1, in_d2, in_clk, dff1, dff2, out_q1, out_q2],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d1", port_id="in_d1.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_d2", port_id="in_d2.out"), target=ConnectionEndpoint(component_id="dff2", port_id="dff2.d")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_4", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff2", port_id="dff2.clk")),
            Connection(id="conn_5", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q1", port_id="out_q1.in")),
            Connection(id="conn_6", source=ConnectionEndpoint(component_id="dff2", port_id="dff2.q"), target=ConnectionEndpoint(component_id="out_q2", port_id="out_q2.in")),
        ],
        root_component_ids=["in_d1", "in_d2", "in_clk", "dff1", "dff2", "out_q1", "out_q2"],
        provenance=_provenance(),
    )


# 1: initial state before any rising edge is honestly UNKNOWN, and a
# rising edge with D=0 captures Q=0.
def test_rising_edge_with_d_zero_captures_q_zero() -> None:
    stimulus = {
        "in_d.out": [(0, 0)],
        "in_clk.out": [(0, 0), (1, 1)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=2)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 0) == LogicValue.UNKNOWN
    assert _signal(result, "dff1.q", 1) == LogicValue.ZERO


# 2: a rising edge with D=1 captures Q=1.
def test_rising_edge_with_d_one_captures_q_one() -> None:
    stimulus = {
        "in_d.out": [(0, 1)],
        "in_clk.out": [(0, 0), (1, 1)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=2)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 1) == LogicValue.ONE


# 3: D changes while CLK stays 0 - Q must not update at all.
def test_d_changes_while_clk_low_does_not_update_q() -> None:
    stimulus = {
        "in_d.out": [(0, 0), (1, 1), (2, 0)],
        "in_clk.out": [(0, 0)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=3)

    assert result.is_valid, result.errors
    for t in range(3):
        assert _signal(result, "dff1.q", t) == LogicValue.UNKNOWN


# 4: D changes while CLK stays 1 (no NEW rising edge, clock was already
# high the previous timestep) - Q must not incorrectly re-capture.
def test_d_changes_while_clk_stays_high_does_not_recapture() -> None:
    stimulus = {
        "in_d.out": [(0, 0), (1, 1), (2, 0)],
        "in_clk.out": [(0, 0), (1, 1)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=3)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 1) == LogicValue.ONE  # real rising edge at t=1, D=1
    assert _signal(result, "dff1.q", 2) == LogicValue.ONE  # clk still 1 (no new edge); D changed to 0 but Q holds


# 5: a falling edge (1 -> 0) must never update Q.
def test_falling_edge_does_not_update_q() -> None:
    stimulus = {
        "in_d.out": [(0, 1), (1, 1), (2, 0)],
        "in_clk.out": [(0, 0), (1, 1), (2, 0)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=3)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 1) == LogicValue.ONE  # rising edge at t=1 captures D=1
    assert _signal(result, "dff1.q", 2) == LogicValue.ONE  # falling edge at t=2 - Q holds


# 6: multiple rising edges capture different D values over time.
def test_multiple_rising_edges_capture_different_values() -> None:
    stimulus = {
        "in_d.out": [(0, 0), (2, 1), (4, 0), (6, 1)],
        "in_clk.out": [(0, 0), (1, 1), (2, 0), (3, 1), (4, 0), (5, 1), (6, 0), (7, 1)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=8)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 0) == LogicValue.UNKNOWN
    assert _signal(result, "dff1.q", 1) == LogicValue.ZERO  # rising edge at t=1, D=0
    assert _signal(result, "dff1.q", 3) == LogicValue.ONE  # rising edge at t=3, D=1
    assert _signal(result, "dff1.q", 5) == LogicValue.ZERO  # rising edge at t=5, D=0
    assert _signal(result, "dff1.q", 7) == LogicValue.ONE  # rising edge at t=7, D=1


# 7: two DFFs sharing a clock but different D inputs maintain
# independent state.
def test_two_dffs_maintain_independent_state() -> None:
    stimulus = {
        "in_d1.out": [(0, 1)],
        "in_d2.out": [(0, 0)],
        "in_clk.out": [(0, 0), (1, 1)],
    }
    result = simulate_sequential(_two_dff_document(), stimulus, num_timesteps=2)

    assert result.is_valid, result.errors
    assert _signal(result, "dff1.q", 1) == LogicValue.ONE
    assert _signal(result, "dff2.q", 1) == LogicValue.ZERO


# 8: existing purely-combinational behavior (AND/OR/NOT) is unchanged
# when run through the new sequential engine over multiple timesteps
# with no DFF present at all.
def test_combinational_only_document_still_works_unchanged() -> None:
    stimulus = {"in_a.out": [(0, 0), (1, 1)], "in_b.out": [(0, 1), (1, 1)]}
    result = simulate_sequential(and_gate_document(), stimulus, num_timesteps=2)

    assert result.is_valid, result.errors
    assert _signal(result, "out_y.in", 0) == LogicValue.ZERO
    assert _signal(result, "out_y.in", 1) == LogicValue.ONE

    inverter_stimulus = {"in_a.out": [(0, 0), (1, 1)]}
    inverter_result = simulate_sequential(simple_inverter_document(), inverter_stimulus, num_timesteps=2)

    assert inverter_result.is_valid, inverter_result.errors
    assert _signal(inverter_result, "out_y.in", 0) == LogicValue.ONE
    assert _signal(inverter_result, "out_y.in", 1) == LogicValue.ZERO


# 9: an unsupported component kind is still honestly rejected by the
# sequential engine too (not silently accepted just because DFF is now
# supported).
def test_unsupported_component_kind_is_still_rejected() -> None:
    in_a = Component(
        id="in_a", kind="input", name="A",
        ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    weird = Component(
        id="weird1", kind="MYSTERY_GATE", name="Weird",
        ports=[
            Port(id="weird1.in", name="in", direction=PortDirection.INPUT, width=1),
            Port(id="weird1.out", name="out", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    document = IRDocument(
        id="doc_mystery",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Mystery",
        components=[in_a, weird],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="weird1", port_id="weird1.in")),
        ],
        root_component_ids=["in_a", "weird1"],
        provenance=_provenance(),
    )

    result = simulate_sequential(document, {"in_a.out": [(0, 1)]}, num_timesteps=1)

    assert not result.is_valid
    assert any(error.code == "UNSUPPORTED_COMPONENT_KIND" and "weird1" in error.path for error in result.errors)


# 10: an invalid DFF port structure (missing clk port entirely) is still
# rejected by the existing guardrails-level check_dff_port_shape ERROR,
# exactly as it is for the non-time-stepped simulate() path.
def test_invalid_dff_port_shape_is_still_rejected() -> None:
    in_d = Component(
        id="in_d", kind="input", name="D_IN",
        ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    broken_dff = Component(
        id="dff1", kind="DFF", name="DFF1",
        ports=[
            Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
            Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_q = Component(
        id="out_q", kind="output", name="Q_OUT",
        ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)],
    )
    document = IRDocument(
        id="doc_broken_dff",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Broken DFF",
        components=[in_d, broken_dff, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "dff1", "out_q"],
        provenance=_provenance(),
    )

    result = simulate_sequential(document, {"in_d.out": [(0, 1)]}, num_timesteps=1)

    assert not result.is_valid
    assert any(error.code == "DFF_MISSING_CLK_PORT" for error in result.errors)


# 11: waveform/history output is exact across every timestep, not just
# the final value - guards against a "return only the final answer"
# fabricated shortcut implementation.
def test_full_waveform_history_is_recorded_across_timesteps() -> None:
    stimulus = {
        "in_d.out": [(0, 1), (2, 0)],
        "in_clk.out": [(0, 0), (1, 1), (2, 0), (3, 1)],
    }
    result = simulate_sequential(dff_document(), stimulus, num_timesteps=4)

    assert result.is_valid, result.errors
    assert len(result.timesteps) == 4
    assert [step.index for step in result.timesteps] == [0, 1, 2, 3]

    expected_q = [LogicValue.UNKNOWN, LogicValue.ONE, LogicValue.ONE, LogicValue.ZERO]
    expected_clk = [LogicValue.ZERO, LogicValue.ONE, LogicValue.ZERO, LogicValue.ONE]
    expected_d = [LogicValue.ONE, LogicValue.ONE, LogicValue.ZERO, LogicValue.ZERO]
    for t in range(4):
        assert _signal(result, "dff1.q", t) == expected_q[t]
        assert _signal(result, "dff1.clk", t) == expected_clk[t]
        assert _signal(result, "dff1.d", t) == expected_d[t]


# 12: num_timesteps must be at least 1.
def test_zero_timesteps_is_rejected() -> None:
    result = simulate_sequential(dff_document(), {}, num_timesteps=0)

    assert not result.is_valid
    assert any(error.code == "INVALID_TIMESTEP_COUNT" for error in result.errors)


# 13: an out-of-range stimulus timestep is rejected with a structured
# error, never silently ignored or clamped.
def test_stimulus_timestep_out_of_range_is_rejected() -> None:
    result = simulate_sequential(dff_document(), {"in_d.out": [(5, 1)]}, num_timesteps=2)

    assert not result.is_valid
    assert any(error.code == "INVALID_STIMULUS_TIMESTEP" for error in result.errors)


# 14: a multi-bit (width != 1) DFF is honestly rejected as unsupported -
# never silently truncated/fabricated to width 1. This simulator only
# ever claims scalar (width=1) support, for both combinational AND
# sequential documents alike (reuses engine._check_widths unchanged).
def test_multi_bit_dff_width_is_honestly_rejected() -> None:
    in_d = Component(
        id="in_d", kind="input", name="D_IN",
        ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=2)],
    )
    in_clk = Component(
        id="in_clk", kind="input", name="CLK_IN",
        ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1, type="clock")],
    )
    wide_dff = Component(
        id="dff1", kind="DFF", name="DFF1",
        ports=[
            Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=2),
            Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1, type="clock"),
            Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=2),
        ],
    )
    out_q = Component(
        id="out_q", kind="output", name="Q_OUT",
        ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=2)],
    )
    document = IRDocument(
        id="doc_wide_dff",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Wide DFF",
        components=[in_d, in_clk, wide_dff, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "dff1", "out_q"],
        provenance=_provenance(),
    )

    result = simulate_sequential(document, {"in_d.out": [(0, 1)]}, num_timesteps=1)

    assert not result.is_valid
    assert any(error.code == "UNSUPPORTED_WIDTH" and "dff1.d" in error.path for error in result.errors)
    assert any(error.code == "UNSUPPORTED_WIDTH" and "dff1.q" in error.path for error in result.errors)
