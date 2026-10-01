from datetime import datetime, timezone

from app.domain.guardrails.models import GuardrailSeverity
from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.examples import and_gate_document, dff_document
from app.domain.ir.models import (
    Annotation,
    BitRange,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def test_valid_ir_passes() -> None:
    result = run_guardrails(and_gate_document())

    assert result.is_valid
    assert result.errors == []
    assert result.normalized_document is not None
    assert result.normalized_document.id == "doc_and_gate"


def test_invalid_component_reference_fails() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])

    document = IRDocument(
        id="doc_bad_component_ref",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Component Ref",
        components=[in_a],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="does_not_exist", port_id="fake.in")),
        ],
        root_component_ids=["in_a"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert result.normalized_document is None
    assert any(issue.code == "MISSING_TARGET_COMPONENT" for issue in result.errors)


def test_invalid_port_reference_fails() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_bad_port_ref",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Port Ref",
        components=[in_a, not1],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.fake"), target=ConnectionEndpoint(component_id="not1", port_id="not1.a")),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "MISSING_SOURCE_PORT" for issue in result.errors)


def test_duplicate_ids_fail() -> None:
    c1 = Component(id="dup", kind="AND", name="C1")
    c2 = Component(id="dup", kind="OR", name="C2")

    document = IRDocument(
        id="doc_dup",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Duplicate",
        components=[c1, c2],
        root_component_ids=["dup"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "DUPLICATE_ID" for issue in result.errors)


def test_invalid_bit_range_fails() -> None:
    reg_a = Component(id="reg_a", kind="REGISTER", name="Reg A", ports=[Port(id="reg_a.q", name="q", direction=PortDirection.OUTPUT, width=2)])
    reg_b = Component(id="reg_b", kind="REGISTER", name="Reg B", ports=[Port(id="reg_b.d", name="d", direction=PortDirection.INPUT, width=4)])

    document = IRDocument(
        id="doc_bad_bit_range",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Bit Range",
        components=[reg_a, reg_b],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="reg_a", port_id="reg_a.q", bit_range=BitRange(msb=3, lsb=0)),
                target=ConnectionEndpoint(component_id="reg_b", port_id="reg_b.d"),
            ),
        ],
        root_component_ids=["reg_a", "reg_b"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "INVALID_BIT_RANGE" for issue in result.errors)


def test_multiple_overlapping_drivers_fail() -> None:
    drv_a = Component(id="drv_a", kind="output", name="A", ports=[Port(id="drv_a.y", name="y", direction=PortDirection.OUTPUT, width=1)])
    drv_b = Component(id="drv_b", kind="output", name="B", ports=[Port(id="drv_b.y", name="y", direction=PortDirection.OUTPUT, width=1)])
    sink = Component(id="sink", kind="input", name="Sink", ports=[Port(id="sink.in", name="in", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_multi_driver",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Multiple Drivers",
        components=[drv_a, drv_b, sink],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="drv_a", port_id="drv_a.y"), target=ConnectionEndpoint(component_id="sink", port_id="sink.in")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="drv_b", port_id="drv_b.y"), target=ConnectionEndpoint(component_id="sink", port_id="sink.in")),
        ],
        root_component_ids=["drv_a", "drv_b", "sink"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "MULTIPLE_DRIVERS_CONFLICT" for issue in result.errors)


def test_non_overlapping_bus_slices_pass() -> None:
    drv_hi = Component(id="drv_hi", kind="output", name="Hi", ports=[Port(id="drv_hi.y", name="y", direction=PortDirection.OUTPUT, width=2)])
    drv_lo = Component(id="drv_lo", kind="output", name="Lo", ports=[Port(id="drv_lo.y", name="y", direction=PortDirection.OUTPUT, width=2)])
    bus = Component(id="bus", kind="input", name="Bus", ports=[Port(id="bus.in", name="in", direction=PortDirection.INPUT, width=4)])

    document = IRDocument(
        id="doc_bus_assembly",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bus Assembly",
        components=[drv_hi, drv_lo, bus],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="drv_hi", port_id="drv_hi.y"), target=ConnectionEndpoint(component_id="bus", port_id="bus.in", bit_range=BitRange(msb=3, lsb=2))),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="drv_lo", port_id="drv_lo.y"), target=ConnectionEndpoint(component_id="bus", port_id="bus.in", bit_range=BitRange(msb=1, lsb=0))),
        ],
        root_component_ids=["drv_hi", "drv_lo", "bus"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert result.is_valid
    assert result.normalized_document is not None


def test_hierarchy_cycle_fails() -> None:
    a = Component(id="a", kind="MODULE", name="A", parent_id="b")
    b = Component(id="b", kind="MODULE", name="B", parent_id="a")

    document = IRDocument(
        id="doc_cycle",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Cycle",
        components=[a, b],
        root_component_ids=[],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "HIERARCHY_CYCLE" for issue in result.errors)


def test_invalid_root_reference_fails() -> None:
    child = Component(id="child", kind="AND", name="Child")

    document = IRDocument(
        id="doc_root_mismatch",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Root Mismatch",
        components=[child],
        root_component_ids=["does_not_exist"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "ROOT_COMPONENT_MISMATCH" for issue in result.errors)


def test_invalid_schema_version_fails() -> None:
    document = IRDocument(
        id="doc_bad_schema",
        schema_version="9.9.9-unsupported",
        design_version="1",
        name="Bad Schema",
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "UNSUPPORTED_SCHEMA_VERSION" for issue in result.errors)


def test_empty_identifier_is_rejected() -> None:
    document = IRDocument(
        id="",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Empty Id Document",
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "EMPTY_IDENTIFIER" for issue in result.errors)


def test_dangling_annotation_reference_is_a_warning_not_an_error() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray note", target_id="does_not_exist")]}
    )

    result = run_guardrails(document)

    assert result.is_valid
    assert result.errors == []
    assert any(
        issue.code == "DANGLING_ANNOTATION_REFERENCE" and issue.severity == GuardrailSeverity.WARNING
        for issue in result.warnings
    )


def test_normalization_is_deterministic_via_run_guardrails() -> None:
    first = run_guardrails(and_gate_document())
    second = run_guardrails(and_gate_document())

    assert first.normalized_document == second.normalized_document
    assert first.errors == second.errors
    assert first.warnings == second.warnings


def test_normalization_does_not_change_circuit_semantics() -> None:
    document = and_gate_document()

    result = run_guardrails(document)

    assert result.normalized_document is not None
    assert {c.id for c in result.normalized_document.components} == {c.id for c in document.components}
    assert {c.id for c in result.normalized_document.connections} == {c.id for c in document.connections}
    assert set(result.normalized_document.root_component_ids) == set(document.root_component_ids)


def test_and_gate_example_has_zero_floating_input_warnings() -> None:
    result = run_guardrails(and_gate_document())

    assert result.is_valid
    assert not any(issue.code == "FLOATING_INPUT_PORT" for issue in result.warnings)


def test_undriven_input_port_is_a_warning_not_an_error() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[
        Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1),
        Port(id="not1.y", name="y", direction=PortDirection.OUTPUT, width=1),
    ])

    document = IRDocument(
        id="doc_floating_input",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Floating Input",
        components=[in_a, not1],
        connections=[],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert result.is_valid
    assert result.errors == []
    assert any(
        issue.code == "FLOATING_INPUT_PORT"
        and issue.severity == GuardrailSeverity.WARNING
        and issue.path == "components.not1.ports.not1.a"
        for issue in result.warnings
    )


def test_unsafe_ambiguous_situation_is_rejected_not_guessed() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
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

    result = run_guardrails(document)

    assert not result.is_valid
    assert result.normalized_document is None


def test_dff_document_passes_guardrails_with_zero_errors() -> None:
    result = run_guardrails(dff_document())

    assert result.is_valid
    assert result.errors == []
    assert not any(issue.code.startswith("DFF_") for issue in result.warnings)


def test_dff_missing_clk_port_is_rejected_as_an_error() -> None:
    in_d = Component(id="in_d", kind="input", name="D", ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    dff1 = Component(id="dff1", kind="DFF", name="DFF1", ports=[
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_dff_no_clk",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Missing Clock",
        components=[in_d, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "dff1", "out_q"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "DFF_MISSING_CLK_PORT" and issue.severity == GuardrailSeverity.ERROR for issue in result.errors)


def test_dff_multi_bit_clock_is_rejected_as_an_error() -> None:
    in_d = Component(id="in_d", kind="input", name="D", ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_clk = Component(id="in_clk", kind="input", name="CLK", ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=4)])
    dff1 = Component(id="dff1", kind="DFF", name="DFF1", ports=[
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=4),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_dff_wide_clk",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Wide Clock",
        components=[in_d, in_clk, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "dff1", "out_q"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "DFF_INVALID_CLK_WIDTH" for issue in result.errors)


def test_dff_q_width_mismatch_with_d_is_rejected_as_an_error() -> None:
    in_d = Component(id="in_d", kind="input", name="D", ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=4)])
    in_clk = Component(id="in_clk", kind="input", name="CLK", ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    dff1 = Component(id="dff1", kind="DFF", name="DFF1", ports=[
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=4),
        Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_dff_width_mismatch",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Width Mismatch",
        components=[in_d, in_clk, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "dff1", "out_q"],
        provenance=_provenance(),
    )

    result = run_guardrails(document)

    assert not result.is_valid
    assert any(issue.code == "DFF_WIDTH_MISMATCH" for issue in result.errors)
