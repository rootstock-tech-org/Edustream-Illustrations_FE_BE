from datetime import datetime, timezone

from app.domain.guardrails.normalization import normalize_document
from app.domain.ir.models import (
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Parameter,
    Port,
    PortDirection,
    Provenance,
)

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _unordered_document() -> IRDocument:
    comp_z = Component(
        id="z_comp", kind="input", name="Z",
        ports=[
            Port(id="z_comp.z_port", name="z", direction=PortDirection.OUTPUT, width=1),
            Port(id="z_comp.a_port", name="a", direction=PortDirection.OUTPUT, width=1),
        ],
        parameters=[Parameter(name="z_param", value=1), Parameter(name="a_param", value=2)],
    )
    comp_a = Component(id="a_comp", kind="output", name="A", ports=[Port(id="a_comp.in", name="in", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_unordered",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Unordered",
        components=[comp_z, comp_a],
        connections=[
            Connection(id="conn_z", source=ConnectionEndpoint(component_id="z_comp", port_id="z_comp.a_port"), target=ConnectionEndpoint(component_id="a_comp", port_id="a_comp.in")),
        ],
        root_component_ids=["z_comp", "a_comp"],
        provenance=_provenance(),
    )


def test_normalize_orders_components_by_id() -> None:
    normalized = normalize_document(_unordered_document())
    assert [c.id for c in normalized.components] == ["a_comp", "z_comp"]


def test_normalize_orders_ports_within_component() -> None:
    normalized = normalize_document(_unordered_document())
    z_comp = next(c for c in normalized.components if c.id == "z_comp")
    assert [p.id for p in z_comp.ports] == ["z_comp.a_port", "z_comp.z_port"]


def test_normalize_orders_parameters_by_name() -> None:
    normalized = normalize_document(_unordered_document())
    z_comp = next(c for c in normalized.components if c.id == "z_comp")
    assert [p.name for p in z_comp.parameters] == ["a_param", "z_param"]


def test_normalize_orders_root_component_ids() -> None:
    normalized = normalize_document(_unordered_document())
    assert normalized.root_component_ids == ["a_comp", "z_comp"]


def test_normalize_orders_connections_by_id() -> None:
    document = _unordered_document().model_copy(
        update={
            "connections": [
                Connection(id="conn_z", source=ConnectionEndpoint(component_id="z_comp", port_id="z_comp.a_port"), target=ConnectionEndpoint(component_id="a_comp", port_id="a_comp.in")),
                Connection(id="conn_a", source=ConnectionEndpoint(component_id="z_comp", port_id="z_comp.z_port"), target=ConnectionEndpoint(component_id="a_comp", port_id="a_comp.in")),
            ]
        }
    )
    normalized = normalize_document(document)
    assert [c.id for c in normalized.connections] == ["conn_a", "conn_z"]


def test_normalize_is_deterministic_across_repeated_calls() -> None:
    document = _unordered_document()
    assert normalize_document(document) == normalize_document(document)


def test_normalize_is_idempotent() -> None:
    once = normalize_document(_unordered_document())
    twice = normalize_document(once)
    assert once == twice


def test_normalize_does_not_change_any_field_value() -> None:
    original = _unordered_document()
    normalized = normalize_document(original)

    original_by_id = {c.id: c for c in original.components}
    normalized_by_id = {c.id: c for c in normalized.components}

    assert set(original_by_id) == set(normalized_by_id)
    for component_id, original_component in original_by_id.items():
        normalized_component = normalized_by_id[component_id]
        assert normalized_component.kind == original_component.kind
        assert normalized_component.name == original_component.name
        assert normalized_component.parent_id == original_component.parent_id
        assert {p.id for p in normalized_component.ports} == {p.id for p in original_component.ports}
        assert {(p.id, p.direction, p.width) for p in normalized_component.ports} == {
            (p.id, p.direction, p.width) for p in original_component.ports
        }
