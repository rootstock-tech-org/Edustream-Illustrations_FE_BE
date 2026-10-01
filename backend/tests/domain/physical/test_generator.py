from datetime import datetime, timezone

from app.domain.ir.examples import and_gate_document, hierarchical_module_document, multi_bit_connection_document
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
from app.domain.physical.generator import generate_physical_layout

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


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


def test_and_gate_generates_successfully() -> None:
    result = generate_physical_layout(and_gate_document())

    assert result.is_valid
    assert result.errors == []
    assert result.physical is not None


def test_all_source_components_present_exactly_once() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    source_ids = [block.source_component_id for block in result.physical.blocks]
    assert sorted(source_ids) == sorted(c.id for c in document.components)
    assert len(source_ids) == len(set(source_ids))


def test_every_connection_has_exactly_one_physical_net() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    source_connection_ids = [net.source_connection_id for net in result.physical.nets]
    assert sorted(source_connection_ids) == sorted(c.id for c in document.connections)
    assert len(source_connection_ids) == len(set(source_connection_ids))


def test_ids_are_derived_deterministically_from_source_ids() -> None:
    result = generate_physical_layout(and_gate_document())
    assert result.physical is not None

    and1 = next(b for b in result.physical.blocks if b.source_component_id == "and1")
    assert and1.id == "phys_and1"
    assert all(pin.id == f"pin_{pin.source_port_id}" for pin in and1.pins)

    net = next(n for n in result.physical.nets if n.source_connection_id == "conn_1")
    assert net.id == "net_conn_1"


def test_pin_direction_preserved() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    and1 = next(b for b in result.physical.blocks if b.source_component_id == "and1")
    source_and1 = next(c for c in document.components if c.id == "and1")

    for pin in and1.pins:
        source_port = next(p for p in source_and1.ports if p.id == pin.source_port_id)
        assert pin.direction == source_port.direction


def test_invalid_ir_does_not_generate_physical_layout() -> None:
    result = generate_physical_layout(_dangling_connection_document())

    assert not result.is_valid
    assert result.physical is None
    assert len(result.errors) > 0
    assert any(error.code == "MISSING_TARGET_PORT" for error in result.errors)


def test_generation_is_deterministic() -> None:
    first = generate_physical_layout(and_gate_document())
    second = generate_physical_layout(and_gate_document())
    assert first == second


def test_blocks_do_not_overlap() -> None:
    result = generate_physical_layout(and_gate_document())
    assert result.physical is not None
    blocks = result.physical.blocks

    def overlaps(a, b) -> bool:
        return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height

    for i in range(len(blocks)):
        for j in range(i + 1, len(blocks)):
            assert not overlaps(blocks[i], blocks[j])


def test_component_order_independence() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"components": list(reversed(document.components))})

    original = generate_physical_layout(document)
    reversed_result = generate_physical_layout(reversed_document)

    assert original.physical is not None and reversed_result.physical is not None
    assert original.physical.blocks == reversed_result.physical.blocks


def test_connection_order_independence() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"connections": list(reversed(document.connections))})

    original = generate_physical_layout(document)
    reversed_result = generate_physical_layout(reversed_document)

    assert original.physical is not None and reversed_result.physical is not None
    assert original.physical.nets == reversed_result.physical.nets


def test_original_document_is_not_mutated() -> None:
    document = and_gate_document()
    snapshot = document.model_copy(deep=True)

    generate_physical_layout(document)

    assert document == snapshot


def test_hierarchical_document_generates_all_blocks_and_nets() -> None:
    document = hierarchical_module_document()
    result = generate_physical_layout(document)

    assert result.is_valid
    assert result.physical is not None
    assert len(result.physical.blocks) == len(document.components) == 2
    assert len(result.physical.nets) == len(document.connections) == 3


def test_multi_bit_document_generates_successfully() -> None:
    # Unlike simulation (behavioral semantics), physical placement is
    # purely structural - REGISTER/width>1 components are placed fine.
    document = multi_bit_connection_document()
    result = generate_physical_layout(document)

    assert result.is_valid
    assert result.physical is not None
    assert len(result.physical.blocks) == 2


def test_guardrail_warnings_propagate_without_blocking_generation() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray note", target_id="does_not_exist")]}
    )

    result = generate_physical_layout(document)

    assert result.is_valid
    assert result.physical is not None
    assert any(warning.code == "DANGLING_ANNOTATION_REFERENCE" for warning in result.warnings)


def test_every_block_source_id_exists_in_ir() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    ir_component_ids = {c.id for c in document.components}
    for block in result.physical.blocks:
        assert block.source_component_id in ir_component_ids


def test_every_pin_source_id_exists_on_its_source_component() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    components_by_id = {c.id: c for c in document.components}
    for block in result.physical.blocks:
        source_component = components_by_id[block.source_component_id]
        source_port_ids = {p.id for p in source_component.ports}
        for pin in block.pins:
            assert pin.source_port_id in source_port_ids


def test_every_net_source_connection_id_exists_in_ir() -> None:
    document = and_gate_document()
    result = generate_physical_layout(document)
    assert result.physical is not None

    ir_connection_ids = {c.id for c in document.connections}
    for net in result.physical.nets:
        assert net.source_connection_id in ir_connection_ids


def test_die_bounds_enclose_every_block() -> None:
    result = generate_physical_layout(and_gate_document())
    assert result.physical is not None

    for block in result.physical.blocks:
        assert block.x + block.width <= result.physical.die_width
        assert block.y + block.height <= result.physical.die_height
