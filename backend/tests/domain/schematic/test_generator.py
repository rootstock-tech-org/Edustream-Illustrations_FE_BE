from datetime import datetime, timezone

from app.domain.ir.examples import and_gate_document, hierarchical_module_document, multi_bit_connection_document
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
from app.domain.schematic.generator import generate_schematic

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
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"),
                target=ConnectionEndpoint(component_id="not1", port_id="not1.does_not_exist"),
            ),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )


def test_and_gate_generates_successfully() -> None:
    result = generate_schematic(and_gate_document())

    assert result.is_valid
    assert result.errors == []
    assert result.schematic is not None


def test_all_source_components_present_exactly_once() -> None:
    document = and_gate_document()
    result = generate_schematic(document)

    assert result.schematic is not None
    source_ids = [c.source_component_id for c in result.schematic.components]
    assert sorted(source_ids) == sorted(c.id for c in document.components)
    assert len(source_ids) == len(set(source_ids))  # exactly one each, no duplicates


def test_every_connection_has_exactly_one_schematic_wire() -> None:
    document = and_gate_document()
    result = generate_schematic(document)

    assert result.schematic is not None
    source_connection_ids = [w.source_connection_id for w in result.schematic.wires]
    assert sorted(source_connection_ids) == sorted(c.id for c in document.connections)
    assert len(source_connection_ids) == len(set(source_connection_ids))


def test_schematic_ids_are_derived_from_source_ids_deterministically() -> None:
    result = generate_schematic(and_gate_document())
    assert result.schematic is not None

    and1 = next(c for c in result.schematic.components if c.source_component_id == "and1")
    assert and1.id == "sc_and1"
    assert all(port.id == f"sp_{port.source_port_id}" for port in and1.ports)

    wire = next(w for w in result.schematic.wires if w.source_connection_id == "conn_1")
    assert wire.id == "sw_conn_1"


def test_port_direction_and_width_preserved() -> None:
    document = and_gate_document()
    result = generate_schematic(document)
    assert result.schematic is not None

    and1 = next(c for c in result.schematic.components if c.source_component_id == "and1")
    source_and1 = next(c for c in document.components if c.id == "and1")

    for schematic_port in and1.ports:
        source_port = next(p for p in source_and1.ports if p.id == schematic_port.source_port_id)
        assert schematic_port.direction == source_port.direction
        assert schematic_port.width == source_port.width


def test_bit_range_preserved_for_multi_bit_connection() -> None:
    document = multi_bit_connection_document()
    result = generate_schematic(document)
    assert result.schematic is not None
    assert len(result.schematic.wires) == 1

    wire = result.schematic.wires[0]
    source_connection = document.connections[0]
    assert wire.source.bit_range == source_connection.source.bit_range
    assert wire.target.bit_range == source_connection.target.bit_range
    assert wire.source.bit_range == BitRange(msb=3, lsb=0)


def test_invalid_ir_does_not_generate_schematic() -> None:
    result = generate_schematic(_dangling_connection_document())

    assert not result.is_valid
    assert result.schematic is None
    assert len(result.errors) > 0


def test_guardrail_errors_propagate_as_structured_schematic_errors() -> None:
    result = generate_schematic(_dangling_connection_document())

    assert any(error.code == "MISSING_TARGET_PORT" for error in result.errors)
    assert all(error.message and error.path for error in result.errors)


def test_generation_is_deterministic() -> None:
    first = generate_schematic(and_gate_document())
    second = generate_schematic(and_gate_document())

    assert first == second


def test_repeated_generation_produces_identical_coordinates() -> None:
    first = generate_schematic(and_gate_document())
    second = generate_schematic(and_gate_document())
    assert first.schematic is not None and second.schematic is not None

    first_positions = {c.source_component_id: (c.x, c.y) for c in first.schematic.components}
    second_positions = {c.source_component_id: (c.x, c.y) for c in second.schematic.components}
    assert first_positions == second_positions


def test_input_ports_positioned_at_component_left_edge() -> None:
    result = generate_schematic(and_gate_document())
    assert result.schematic is not None

    and1 = next(c for c in result.schematic.components if c.source_component_id == "and1")
    input_ports = [p for p in and1.ports if p.direction == PortDirection.INPUT]
    assert input_ports
    assert all(p.x == and1.x for p in input_ports)


def test_output_ports_positioned_at_component_right_edge() -> None:
    result = generate_schematic(and_gate_document())
    assert result.schematic is not None

    and1 = next(c for c in result.schematic.components if c.source_component_id == "and1")
    output_ports = [p for p in and1.ports if p.direction == PortDirection.OUTPUT]
    assert output_ports
    assert all(p.x == and1.x + and1.width for p in output_ports)


def test_components_do_not_unexpectedly_overlap() -> None:
    result = generate_schematic(and_gate_document())
    assert result.schematic is not None
    components = result.schematic.components

    def overlaps(a, b) -> bool:
        return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height

    for i in range(len(components)):
        for j in range(i + 1, len(components)):
            assert not overlaps(components[i], components[j])


def test_component_ordering_independent_of_input_list_order() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"components": list(reversed(document.components))})

    result_original = generate_schematic(document)
    result_reversed = generate_schematic(reversed_document)

    assert result_original.schematic is not None and result_reversed.schematic is not None
    assert result_original.schematic.components == result_reversed.schematic.components


def test_connection_ordering_independent_of_input_list_order() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"connections": list(reversed(document.connections))})

    result_original = generate_schematic(document)
    result_reversed = generate_schematic(reversed_document)

    assert result_original.schematic is not None and result_reversed.schematic is not None
    assert result_original.schematic.wires == result_reversed.schematic.wires


def test_original_document_is_not_mutated_by_generation() -> None:
    document = and_gate_document()
    snapshot = document.model_copy(deep=True)

    generate_schematic(document)

    assert document == snapshot


def test_no_semantic_information_invented() -> None:
    document = and_gate_document()
    result = generate_schematic(document)
    assert result.schematic is not None

    assert len(result.schematic.components) == len(document.components)
    assert len(result.schematic.wires) == len(document.connections)
    for schematic_component in result.schematic.components:
        source = next(c for c in document.components if c.id == schematic_component.source_component_id)
        assert schematic_component.kind == source.kind
        assert schematic_component.name == source.name
        assert len(schematic_component.ports) == len(source.ports)


def test_hierarchical_document_generates_all_components_and_wires() -> None:
    document = hierarchical_module_document()
    result = generate_schematic(document)

    assert result.is_valid
    assert result.schematic is not None
    assert len(result.schematic.components) == len(document.components) == 2
    assert len(result.schematic.wires) == len(document.connections) == 3


def test_guardrail_warnings_propagate_without_blocking_generation() -> None:
    from app.domain.ir.models import Annotation

    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray note", target_id="does_not_exist")]}
    )

    result = generate_schematic(document)

    assert result.is_valid
    assert result.schematic is not None
    assert any(warning.code == "DANGLING_ANNOTATION_REFERENCE" for warning in result.warnings)


def test_every_schematic_component_source_id_exists_in_ir() -> None:
    document = and_gate_document()
    result = generate_schematic(document)
    assert result.schematic is not None

    ir_component_ids = {c.id for c in document.components}
    for schematic_component in result.schematic.components:
        assert schematic_component.source_component_id in ir_component_ids


def test_every_schematic_port_source_id_exists_on_its_source_component() -> None:
    document = and_gate_document()
    result = generate_schematic(document)
    assert result.schematic is not None

    components_by_id = {c.id: c for c in document.components}
    for schematic_component in result.schematic.components:
        source_component = components_by_id[schematic_component.source_component_id]
        source_port_ids = {p.id for p in source_component.ports}
        for schematic_port in schematic_component.ports:
            assert schematic_port.source_port_id in source_port_ids


def test_every_schematic_wire_source_connection_id_exists_in_ir() -> None:
    document = and_gate_document()
    result = generate_schematic(document)
    assert result.schematic is not None

    ir_connection_ids = {c.id for c in document.connections}
    for wire in result.schematic.wires:
        assert wire.source_connection_id in ir_connection_ids
