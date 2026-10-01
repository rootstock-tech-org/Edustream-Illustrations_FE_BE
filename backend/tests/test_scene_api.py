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
    return client.post("/api/scene/generate", json={"document": to_dict(document)})


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


# 1: successful generation via TestClient
def test_post_and_gate_generates_successfully() -> None:
    response = _post(and_gate_document())

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert body["scene"] is not None
    assert len(body["scene"]["objects"]) == 4


# 2: hierarchical IR
def test_hierarchical_document_generates_all_objects() -> None:
    document = hierarchical_module_document()
    response = _post(document)

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert len(body["scene"]["objects"]) == len(document.components)


# 3: invalid/dangling IR -> structured error, scene=null
def test_post_dangling_ir_returns_structured_error_with_no_partial_scene() -> None:
    response = _post(_dangling_connection_document())

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert body["scene"] is None
    assert any(error["code"] == "MISSING_TARGET_PORT" for error in body["errors"])


# 4: malformed request -> 422
def test_post_missing_document_field_returns_422() -> None:
    response = client.post("/api/scene/generate", json={})
    assert response.status_code == 422


def test_post_document_not_an_object_returns_422() -> None:
    response = client.post("/api/scene/generate", json={"document": "not-an-object"})
    assert response.status_code == 422


def test_post_unknown_request_field_returns_422() -> None:
    response = client.post(
        "/api/scene/generate",
        json={"document": to_dict(and_gate_document()), "not_a_real_field": 1},
    )
    assert response.status_code == 422


# 5: semantically invalid IR -> structured 200, not 422/500
def test_post_semantically_invalid_ir_document_returns_structured_error_not_http_error() -> None:
    response = client.post("/api/scene/generate", json={"document": {"id": "doc_1"}})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "INVALID_IR_DOCUMENT" for error in body["errors"])


# 6: deterministic repeated generation
def test_post_same_request_twice_is_deterministic() -> None:
    first = _post(and_gate_document())
    second = _post(and_gate_document())

    assert first.json() == second.json()


# 7: traceability to actual IR component IDs
def test_scene_objects_trace_to_real_ir_component_ids() -> None:
    document = and_gate_document()
    response = _post(document)
    body = response.json()

    real_component_ids = {c.id for c in document.components}
    response_source_ids = {obj["source_component_id"] for obj in body["scene"]["objects"]}
    assert response_source_ids == real_component_ids


# 8: warning propagation over HTTP
def test_guardrail_warning_survives_serialization() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray", target_id="does_not_exist")]}
    )

    response = _post(document)
    body = response.json()

    assert body["is_valid"] is True
    assert any(warning["code"] == "DANGLING_ANNOTATION_REFERENCE" for warning in body["warnings"])


# 9: ordering behavior over HTTP
def test_component_order_independence_over_http() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"components": list(reversed(document.components))})

    original = _post(document)
    reversed_response = _post(reversed_document)

    assert original.json()["scene"]["objects"] == reversed_response.json()["scene"]["objects"]


# 10: health regression
def test_health_still_ok_alongside_scene_api() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# 11: response serialization/model contract - z baseline and depth are present and correct
def test_response_scene_objects_carry_documented_z_and_depth() -> None:
    response = _post(and_gate_document())
    body = response.json()

    for scene_object in body["scene"]["objects"]:
        assert scene_object["z"] == 0.0
        assert scene_object["depth"] == 20.0
        assert set(scene_object.keys()) == {"id", "source_component_id", "kind", "x", "y", "z", "width", "height", "depth"}
