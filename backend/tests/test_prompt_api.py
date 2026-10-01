from unittest.mock import patch

from fastapi.testclient import TestClient

from app.domain.prompt.groq_client import GroqConfigError
from app.main import app

client = TestClient(app)

_VALID_MUX_RAW_INTENT = {
    "circuit_name": "2:1 Multiplexer",
    "components": [
        {"id": "in_a", "kind": "input", "name": "A"},
        {"id": "in_b", "kind": "input", "name": "B"},
        {"id": "in_sel", "kind": "input", "name": "SEL"},
        {"id": "not_sel", "kind": "NOT", "name": "NOT_SEL"},
        {"id": "and_a", "kind": "AND", "name": "AND_A"},
        {"id": "and_b", "kind": "AND", "name": "AND_B"},
        {"id": "or1", "kind": "OR", "name": "OR1"},
        {"id": "out_y", "kind": "output", "name": "Y"},
    ],
    "connections": [
        {"source_id": "in_a", "target_id": "and_a", "target_port": "a"},
        {"source_id": "in_sel", "target_id": "not_sel", "target_port": "a"},
        {"source_id": "not_sel", "target_id": "and_a", "target_port": "b"},
        {"source_id": "in_b", "target_id": "and_b", "target_port": "a"},
        {"source_id": "in_sel", "target_id": "and_b", "target_port": "b"},
        {"source_id": "and_a", "target_id": "or1", "target_port": "a"},
        {"source_id": "and_b", "target_id": "or1", "target_port": "b"},
        {"source_id": "or1", "target_id": "out_y"},
    ],
}


def _post(prompt: str):
    return client.post("/api/prompt/resolve", json={"prompt": prompt})


def test_known_shaped_prompt_resolves_successfully() -> None:
    with patch("app.domain.prompt.resolver.request_vlsi_intent", return_value=_VALID_MUX_RAW_INTENT):
        response = _post("Design a 2:1 multiplexer")

    assert response.status_code == 200
    body = response.json()
    assert body["is_recognized"] is True
    assert body["failure_reason"] is None
    assert body["document"] is not None
    assert body["document"]["name"] == "2:1 Multiplexer"
    assert len(body["document"]["components"]) == 8


def test_missing_api_key_returns_200_with_typed_failure() -> None:
    with patch("app.domain.prompt.resolver.request_vlsi_intent", side_effect=GroqConfigError("no key")):
        response = _post("Design an AND gate")

    assert response.status_code == 200
    body = response.json()
    assert body["is_recognized"] is False
    assert body["document"] is None
    assert body["failure_reason"] == "missing_api_key"


def test_malformed_ai_output_returns_200_with_typed_failure() -> None:
    with patch("app.domain.prompt.resolver.request_vlsi_intent", return_value={"components": [], "connections": []}):
        response = _post("Design something")

    assert response.status_code == 200
    body = response.json()
    assert body["is_recognized"] is False
    assert body["failure_reason"] == "malformed_intent"


def test_malformed_request_body_produces_422() -> None:
    response = client.post("/api/prompt/resolve", json={})

    assert response.status_code == 422


def test_resolved_document_can_be_fed_into_scene_generation() -> None:
    with patch("app.domain.prompt.resolver.request_vlsi_intent", return_value=_VALID_MUX_RAW_INTENT):
        resolve_response = _post("Design a 2:1 multiplexer")
    document = resolve_response.json()["document"]

    scene_response = client.post("/api/scene/generate", json={"document": document})

    assert scene_response.status_code == 200
    scene_body = scene_response.json()
    assert scene_body["is_valid"] is True
    assert len(scene_body["scene"]["objects"]) == 8
