from typing import Any

from fastapi.testclient import TestClient

from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.ir.models import (
    Annotation,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
)
from app.domain.ir.serialization import to_dict
from app.main import app

client = TestClient(app)


def _post(document: IRDocument):
    return client.post("/api/schematic/generate", json={"document": to_dict(document)})


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
    )


# 1-2: successful generation for a representative valid IR
def test_post_and_gate_generates_successfully() -> None:
    response = _post(and_gate_document())

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert body["schematic"] is not None
    assert len(body["schematic"]["components"]) == 4
    assert len(body["schematic"]["wires"]) == 3


# 3: invalid/dangling IR -> structured error, no fake/partial result
def test_post_dangling_ir_returns_structured_error_with_no_partial_schematic() -> None:
    response = _post(_dangling_connection_document())

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert body["schematic"] is None
    assert any(error["code"] == "MISSING_TARGET_PORT" for error in body["errors"])


# 4: malformed request -> 422
def test_post_missing_document_field_returns_422() -> None:
    response = client.post("/api/schematic/generate", json={})
    assert response.status_code == 422


def test_post_document_not_an_object_returns_422() -> None:
    response = client.post("/api/schematic/generate", json={"document": "not-an-object"})
    assert response.status_code == 422


def test_post_unknown_request_field_returns_422() -> None:
    response = client.post(
        "/api/schematic/generate",
        json={"document": to_dict(and_gate_document()), "not_a_real_field": 1},
    )
    assert response.status_code == 422


# Well-formed request, semantically-invalid IR dict -> structured 200, not 422/500
def test_post_semantically_invalid_ir_document_returns_structured_error_not_http_error() -> None:
    response = client.post("/api/schematic/generate", json={"document": {"id": "doc_1"}})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "INVALID_IR_DOCUMENT" for error in body["errors"])


# 5: deterministic repeated request
def test_post_same_request_twice_is_deterministic() -> None:
    first = _post(and_gate_document())
    second = _post(and_gate_document())

    assert first.json() == second.json()


# 6: traceability to actual IR IDs
def test_schematic_components_trace_to_real_ir_ids() -> None:
    document = and_gate_document()
    response = _post(document)
    body = response.json()

    real_component_ids = {c.id for c in document.components}
    response_source_ids = {c["source_component_id"] for c in body["schematic"]["components"]}
    assert response_source_ids == real_component_ids

    real_connection_ids = {c.id for c in document.connections}
    response_wire_source_ids = {w["source_connection_id"] for w in body["schematic"]["wires"]}
    assert response_wire_source_ids == real_connection_ids


# 7: warnings survive HTTP serialization
def test_guardrail_warning_survives_serialization() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray", target_id="does_not_exist")]}
    )

    response = _post(document)
    body = response.json()

    assert body["is_valid"] is True
    assert any(warning["code"] == "DANGLING_ANNOTATION_REFERENCE" for warning in body["warnings"])


# Hierarchical example (multiple components/connections) generates fully
def test_hierarchical_document_generates_all_components_and_wires() -> None:
    document = hierarchical_module_document()
    response = _post(document)

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert len(body["schematic"]["components"]) == len(document.components)
    assert len(body["schematic"]["wires"]) == len(document.connections)


# Regression: health endpoint remains healthy alongside the new API
def test_health_still_ok_alongside_schematic_api() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
