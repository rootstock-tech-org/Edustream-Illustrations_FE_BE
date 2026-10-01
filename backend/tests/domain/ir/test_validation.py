from datetime import datetime, timezone

from app.domain.ir.examples import ALL_EXAMPLES
from app.domain.ir.models import (
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
from app.domain.ir.validation import validate_document

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def test_all_golden_examples_are_valid() -> None:
    for name, builder in ALL_EXAMPLES.items():
        result = validate_document(builder())
        assert result.is_valid, f"{name} unexpectedly invalid: {result.issues}"


def test_dangling_connection_missing_target_port_is_rejected() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_dangling",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Dangling",
        components=[in_a, not1],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"),
                target=ConnectionEndpoint(component_id="not1", port_id="not1.does_not_exist"),
            ),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "MISSING_TARGET_PORT" for issue in result.issues)


def test_invalid_port_reference_on_source_is_rejected() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_bad_port",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Port",
        components=[in_a, not1],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="in_a", port_id="in_a.fake"),
                target=ConnectionEndpoint(component_id="not1", port_id="not1.a"),
            ),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "MISSING_SOURCE_PORT" for issue in result.issues)


def test_invalid_parent_reference_is_rejected() -> None:
    orphan = Component(id="orphan", kind="MODULE", name="Orphan", parent_id="does_not_exist")

    document = IRDocument(
        id="doc_bad_parent",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Parent",
        components=[orphan],
        root_component_ids=[],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "INVALID_PARENT_REFERENCE" for issue in result.issues)


def test_hierarchy_cycle_is_rejected() -> None:
    a = Component(id="a", kind="MODULE", name="A", parent_id="b")
    b = Component(id="b", kind="MODULE", name="B", parent_id="c")
    c = Component(id="c", kind="MODULE", name="C", parent_id="a")

    document = IRDocument(
        id="doc_cycle",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Cycle",
        components=[a, b, c],
        root_component_ids=[],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "HIERARCHY_CYCLE" for issue in result.issues)


def test_duplicate_component_id_is_rejected() -> None:
    c1 = Component(id="dup", kind="AND", name="C1")
    c2 = Component(id="dup", kind="OR", name="C2")

    document = IRDocument(
        id="doc_duplicate",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Duplicate",
        components=[c1, c2],
        root_component_ids=["dup"],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "DUPLICATE_ID" for issue in result.issues)


def test_unsupported_schema_version_is_rejected() -> None:
    document = IRDocument(
        id="doc_bad_schema",
        schema_version="0.0.1-unsupported",
        design_version="1",
        name="Bad Schema",
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "UNSUPPORTED_SCHEMA_VERSION" for issue in result.issues)


def test_root_component_mismatch_is_rejected() -> None:
    child = Component(id="child", kind="AND", name="Child")

    document = IRDocument(
        id="doc_root_mismatch",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Root Mismatch",
        components=[child],
        root_component_ids=[],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "ROOT_COMPONENT_MISMATCH" for issue in result.issues)


def test_incompatible_port_directions_are_rejected() -> None:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_b = Component(id="in_b", kind="input", name="B", ports=[Port(id="in_b.out", name="out", direction=PortDirection.OUTPUT, width=1)])

    document = IRDocument(
        id="doc_bad_direction",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Bad Direction",
        components=[in_a, in_b],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"),
                target=ConnectionEndpoint(component_id="in_b", port_id="in_b.out"),
            ),
        ],
        root_component_ids=["in_a", "in_b"],
        provenance=_provenance(),
    )

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "INVALID_PORT_DIRECTION" for issue in result.issues)


def test_connection_bit_range_wider_than_port_is_rejected() -> None:
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

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "INVALID_BIT_RANGE" for issue in result.issues)


def test_multiple_overlapping_drivers_on_same_port_is_rejected() -> None:
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

    result = validate_document(document)

    assert not result.is_valid
    assert any(issue.code == "MULTIPLE_DRIVERS_CONFLICT" for issue in result.issues)


def test_non_overlapping_bit_range_drivers_on_same_bus_are_not_flagged() -> None:
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

    result = validate_document(document)

    assert not any(issue.code == "MULTIPLE_DRIVERS_CONFLICT" for issue in result.issues)
