from datetime import datetime, timezone

import pytest

from app.domain.ir.examples import (
    and_gate_document,
    dff_document,
    hierarchical_module_document,
    multi_bit_connection_document,
    simple_inverter_document,
    two_component_connection_document,
)
from app.domain.ir.models import (
    Annotation,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)
from app.domain.simulation.engine import simulate
from app.domain.simulation.models import LogicValue

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _or_gate_document() -> IRDocument:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_b = Component(id="in_b", kind="input", name="B", ports=[Port(id="in_b.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    or1 = Component(
        id="or1", kind="OR", name="OR1",
        ports=[
            Port(id="or1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="or1.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="or1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_y = Component(id="out_y", kind="output", name="Y", ports=[Port(id="out_y.in", name="in", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_or_gate",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="OR Gate",
        components=[in_a, in_b, or1, out_y],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="or1", port_id="or1.a")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_b", port_id="in_b.out"), target=ConnectionEndpoint(component_id="or1", port_id="or1.b")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="or1", port_id="or1.y"), target=ConnectionEndpoint(component_id="out_y", port_id="out_y.in")),
        ],
        root_component_ids=["in_a", "in_b", "or1", "out_y"],
        provenance=_provenance(),
    )


def _self_loop_not_document() -> IRDocument:
    not1 = Component(
        id="not1", kind="NOT", name="NOT1",
        ports=[
            Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="not1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    return IRDocument(
        id="doc_self_loop",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Self Loop",
        components=[not1],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="not1", port_id="not1.y"), target=ConnectionEndpoint(component_id="not1", port_id="not1.a")),
        ],
        root_component_ids=["not1"],
        provenance=_provenance(),
    )


def _dangling_connection_document() -> IRDocument:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_dangling",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Dangling",
        components=[in_a, not1],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="not1", port_id="not1.does_not_exist")),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )


# 1-2: full AND truth table (existing and_gate_document example)
@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(0, 0, LogicValue.ZERO), (0, 1, LogicValue.ZERO), (1, 0, LogicValue.ZERO), (1, 1, LogicValue.ONE)],
)
def test_and_gate_full_truth_table(a, b, expected) -> None:
    result = simulate(and_gate_document(), {"in_a.out": a, "in_b.out": b})

    assert result.is_valid
    out_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
    assert out_signal.value == expected


# 3: NOT gate behavior (existing simple_inverter_document example)
@pytest.mark.parametrize(("a", "expected"), [(0, LogicValue.ONE), (1, LogicValue.ZERO)])
def test_not_gate_inverts_input(a, expected) -> None:
    result = simulate(simple_inverter_document(), {"in_a.out": a})

    assert result.is_valid
    out_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
    assert out_signal.value == expected


# 4: OR gate behavior (hand-built - no OR example exists in examples.py)
@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [(0, 0, LogicValue.ZERO), (1, 0, LogicValue.ONE), (0, 1, LogicValue.ONE), (1, 1, LogicValue.ONE)],
)
def test_or_gate_truth_table(a, b, expected) -> None:
    result = simulate(_or_gate_document(), {"in_a.out": a, "in_b.out": b})

    assert result.is_valid
    out_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
    assert out_signal.value == expected


# 5-6: unknown propagation, explicit 3-valued semantics
def test_and_gate_unknown_propagation() -> None:
    zero_and_x = simulate(and_gate_document(), {"in_a.out": 0, "in_b.out": "x"})
    one_and_x = simulate(and_gate_document(), {"in_a.out": 1, "in_b.out": "x"})
    x_and_x = simulate(and_gate_document(), {"in_a.out": "x", "in_b.out": "x"})

    def _out(result):
        return next(s for s in result.final_signals if s.source_port_id == "out_y.in").value

    assert _out(zero_and_x) == LogicValue.ZERO
    assert _out(one_and_x) == LogicValue.UNKNOWN
    assert _out(x_and_x) == LogicValue.UNKNOWN


def test_not_gate_unknown_propagation() -> None:
    result = simulate(simple_inverter_document(), {"in_a.out": "x"})
    out_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
    assert out_signal.value == LogicValue.UNKNOWN


# 7: missing input value
def test_missing_input_value_produces_structured_error() -> None:
    result = simulate(and_gate_document(), {})

    assert not result.is_valid
    assert result.final_signals == []
    codes = {error.code for error in result.errors}
    assert codes == {"MISSING_INPUT_VALUE"}
    paths = {error.path for error in result.errors}
    assert paths == {"components.in_a.ports.in_a.out", "components.in_b.ports.in_b.out"}


def test_invalid_input_value_produces_structured_error() -> None:
    result = simulate(and_gate_document(), {"in_a.out": "banana", "in_b.out": 0})

    assert not result.is_valid
    assert any(error.code == "INVALID_INPUT_VALUE" for error in result.errors)


# 8: unsupported component kind
def test_unsupported_component_kind_produces_structured_error() -> None:
    result = simulate(two_component_connection_document(), {})

    assert not result.is_valid
    assert result.final_signals == []
    assert all(error.code == "UNSUPPORTED_COMPONENT_KIND" for error in result.errors)


def test_multi_bit_document_is_unsupported() -> None:
    result = simulate(multi_bit_connection_document(), {})

    assert not result.is_valid
    assert any(error.code == "UNSUPPORTED_COMPONENT_KIND" for error in result.errors)


def test_dff_document_is_honestly_unsupported_not_a_fabricated_result() -> None:
    """Step 21 follow-up: this simulator has no clock/state concept at
    all (a single fixed-point combinational evaluator) - a real DFF
    simulation would need genuinely new time-stepping infrastructure
    that does not exist here yet. Confirms the honest, pre-existing
    UNSUPPORTED_COMPONENT_KIND path handles a real sequential kind
    exactly like any other unsupported kind - never a crash, never a
    fabricated/best-effort simulated value."""

    result = simulate(dff_document(), {"in_d.out": 1, "in_clk.out": 1})

    assert not result.is_valid
    assert result.final_signals == []
    assert any(error.code == "UNSUPPORTED_COMPONENT_KIND" and "dff1" in error.path for error in result.errors)


def test_hierarchical_module_kind_is_unsupported() -> None:
    result = simulate(hierarchical_module_document(), {"top.in_a": 1, "top.in_b": 1})

    assert not result.is_valid
    assert any(error.code == "UNSUPPORTED_COMPONENT_KIND" and "top" in error.path for error in result.errors)


# 9: invalid IR blocked by guardrails - no partial/fake state
def test_invalid_ir_blocked_by_guardrails() -> None:
    result = simulate(_dangling_connection_document(), {"in_a.out": 1})

    assert not result.is_valid
    assert result.steps == []
    assert result.final_signals == []
    assert any(error.code == "MISSING_TARGET_PORT" for error in result.errors)


# 10: guardrail warnings propagate without blocking
def test_guardrail_warnings_propagate_without_blocking_simulation() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray", target_id="does_not_exist")]}
    )

    result = simulate(document, {"in_a.out": 1, "in_b.out": 1})

    assert result.is_valid
    assert any(warning.code == "DANGLING_ANNOTATION_REFERENCE" for warning in result.warnings)


# 11: deterministic repeated simulation
def test_simulation_is_deterministic() -> None:
    first = simulate(and_gate_document(), {"in_a.out": 1, "in_b.out": 0})
    second = simulate(and_gate_document(), {"in_a.out": 1, "in_b.out": 0})
    assert first == second


# 12-13: component/connection order independence
def test_component_order_independence() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"components": list(reversed(document.components))})

    original = simulate(document, {"in_a.out": 1, "in_b.out": 1})
    reversed_result = simulate(reversed_document, {"in_a.out": 1, "in_b.out": 1})

    assert original.final_signals == reversed_result.final_signals


def test_connection_order_independence() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"connections": list(reversed(document.connections))})

    original = simulate(document, {"in_a.out": 1, "in_b.out": 1})
    reversed_result = simulate(reversed_document, {"in_a.out": 1, "in_b.out": 1})

    assert original.final_signals == reversed_result.final_signals


# 14: no mutation of the original document
def test_original_document_not_mutated() -> None:
    document = and_gate_document()
    snapshot = document.model_copy(deep=True)

    simulate(document, {"in_a.out": 1, "in_b.out": 1})

    assert document == snapshot


# 15: source ids remain traceable
def test_final_signals_are_traceable_to_real_ir_ports() -> None:
    document = and_gate_document()
    result = simulate(document, {"in_a.out": 1, "in_b.out": 1})

    real_port_ids = {port.id for component in document.components for port in component.ports}
    signal_port_ids = {signal.source_port_id for signal in result.final_signals}
    assert signal_port_ids == real_port_ids


# 16: width metadata preserved
def test_width_metadata_preserved() -> None:
    document = and_gate_document()
    result = simulate(document, {"in_a.out": 1, "in_b.out": 1})

    ports_by_id = {port.id: port for component in document.components for port in component.ports}
    for signal in result.final_signals:
        assert signal.width == ports_by_id[signal.source_port_id].width == 1


# 17-18: feedback/cycle safety, bounded stable termination
def test_feedback_self_loop_converges_without_hanging() -> None:
    result = simulate(_self_loop_not_document(), {})

    assert result.is_valid
    assert len(result.steps) <= 5  # converges almost immediately, well bounded
    signal = next(s for s in result.final_signals if s.source_port_id == "not1.y")
    assert signal.value == LogicValue.UNKNOWN


def test_non_convergent_simulation_via_artificially_low_iteration_cap() -> None:
    # A real supported circuit (AND/OR/NOT are a monotone 3-valued logic)
    # always converges - this deliberately forces the defensive
    # NON_CONVERGENT_SIMULATION path via an artificially low cap rather
    # than pretending a currently-supported circuit can actually diverge.
    result = simulate(and_gate_document(), {"in_a.out": 1, "in_b.out": 1}, max_iterations=0)

    assert not result.is_valid
    assert result.final_signals == []
    assert any(error.code == "NON_CONVERGENT_SIMULATION" for error in result.errors)


# 19: hierarchical example only to the extent its semantics are supported
def test_hierarchical_example_correctly_reports_unsupported_rather_than_guessing() -> None:
    result = simulate(hierarchical_module_document(), {"top.in_a": 1, "top.in_b": 1})
    assert not result.is_valid
    # MODULE has no defined behavioral semantics - never guessed/invented.
    assert all(error.code == "UNSUPPORTED_COMPONENT_KIND" for error in result.errors)


# 20: no semantic information invented
def test_no_semantic_information_invented() -> None:
    document = and_gate_document()
    result = simulate(document, {"in_a.out": 1, "in_b.out": 1})

    total_ports = sum(len(component.ports) for component in document.components)
    assert len(result.final_signals) == total_ports
