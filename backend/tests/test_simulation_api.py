from typing import Any

from fastapi.testclient import TestClient

from app.domain.ir.examples import and_gate_document, dff_document, hierarchical_module_document, simple_inverter_document
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


def _post(document: IRDocument, input_values: dict[str, Any], max_iterations: int | None = None):
    payload: dict[str, Any] = {"document": to_dict(document), "input_values": input_values}
    if max_iterations is not None:
        payload["max_iterations"] = max_iterations
    return client.post("/api/simulation/simulate", json=payload)


def _post_sequential(
    document: IRDocument, stimulus: dict[str, list[list[Any]]], num_timesteps: int, max_iterations: int | None = None
):
    payload: dict[str, Any] = {"document": to_dict(document), "stimulus": stimulus, "num_timesteps": num_timesteps}
    if max_iterations is not None:
        payload["max_iterations"] = max_iterations
    return client.post("/api/simulation/simulate-sequential", json=payload)


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


# 1-2: full AND gate via HTTP
def test_post_and_gate_a1_b1_gives_y1() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    out = next(s for s in body["final_signals"] if s["source_port_id"] == "out_y.in")
    assert out["value"] == "1"


def test_post_and_gate_a1_b0_gives_y0() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 0})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    out = next(s for s in body["final_signals"] if s["source_port_id"] == "out_y.in")
    assert out["value"] == "0"


# 3: NOT circuit
def test_post_not_gate_a1_gives_y0() -> None:
    response = _post(simple_inverter_document(), {"in_a.out": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    out = next(s for s in body["final_signals"] if s["source_port_id"] == "out_y.in")
    assert out["value"] == "0"


# 4-5: unknown value propagation
def test_post_and_gate_zero_and_unknown_gives_y0() -> None:
    response = _post(and_gate_document(), {"in_a.out": 0, "in_b.out": "x"})

    body = response.json()
    assert body["is_valid"] is True
    out = next(s for s in body["final_signals"] if s["source_port_id"] == "out_y.in")
    assert out["value"] == "0"


def test_post_and_gate_one_and_unknown_gives_yx() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": "x"})

    body = response.json()
    assert body["is_valid"] is True
    out = next(s for s in body["final_signals"] if s["source_port_id"] == "out_y.in")
    assert out["value"] == "x"


# 6: missing input value
def test_post_missing_input_value_returns_structured_error() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "MISSING_INPUT_VALUE" for error in body["errors"])


# 7: invalid input value
def test_post_invalid_input_value_returns_structured_error() -> None:
    response = _post(and_gate_document(), {"in_a.out": "banana", "in_b.out": 0})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "INVALID_INPUT_VALUE" for error in body["errors"])


# 8: unsupported component kind
def test_post_unsupported_component_kind_returns_structured_error() -> None:
    response = _post(hierarchical_module_document(), {"top.in_a": 1, "top.in_b": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "UNSUPPORTED_COMPONENT_KIND" for error in body["errors"])


# 9: invalid/dangling IR - guardrail error, no fake/partial state
def test_post_dangling_ir_returns_guardrail_error_with_no_final_state() -> None:
    response = _post(_dangling_connection_document(), {"in_a.out": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert body["final_signals"] == []
    assert body["steps"] == []
    assert any(error["code"] == "MISSING_TARGET_PORT" for error in body["errors"])


# 10: guardrail warning survives HTTP serialization
def test_post_guardrail_warning_survives_serialization() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray", target_id="does_not_exist")]}
    )

    response = _post(document, {"in_a.out": 1, "in_b.out": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert any(warning["code"] == "DANGLING_ANNOTATION_REFERENCE" for warning in body["warnings"])


# 11: determinism
def test_post_same_request_twice_is_deterministic() -> None:
    first = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 1})
    second = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 1})

    assert first.json() == second.json()


# 12: response serialization - enum values as plain strings
def test_response_logic_values_serialize_as_plain_strings() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 1})
    body = response.json()

    for signal in body["final_signals"]:
        assert signal["value"] in ("0", "1", "x")


# 13: traceability - final signal ids match real IR port ids
def test_final_signal_ids_match_real_ir_port_ids() -> None:
    document = and_gate_document()
    response = _post(document, {"in_a.out": 1, "in_b.out": 1})
    body = response.json()

    real_port_ids = {port.id for component in document.components for port in component.ports}
    response_port_ids = {signal["source_port_id"] for signal in body["final_signals"]}
    assert response_port_ids == real_port_ids


# 14: malformed request/schema -> normal HTTP validation behavior
def test_post_missing_document_field_returns_422() -> None:
    response = client.post("/api/simulation/simulate", json={"input_values": {}})
    assert response.status_code == 422


def test_post_document_not_an_object_returns_422() -> None:
    response = client.post("/api/simulation/simulate", json={"document": "not-an-object", "input_values": {}})
    assert response.status_code == 422


def test_post_unknown_request_field_returns_422() -> None:
    response = client.post(
        "/api/simulation/simulate",
        json={"document": to_dict(and_gate_document()), "input_values": {}, "not_a_real_field": 1},
    )
    assert response.status_code == 422


# Well-formed request, but semantically-invalid IR dict -> structured 200, not 422/500
def test_post_semantically_invalid_ir_document_returns_structured_error_not_http_error() -> None:
    response = client.post(
        "/api/simulation/simulate",
        json={"document": {"id": "doc_1"}, "input_values": {}},  # missing required IR fields
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "INVALID_IR_DOCUMENT" for error in body["errors"])


# Optional max_iterations override is honored
def test_post_with_low_max_iterations_can_report_non_convergence() -> None:
    response = _post(and_gate_document(), {"in_a.out": 1, "in_b.out": 1}, max_iterations=1)
    body = response.json()

    assert body["is_valid"] is False
    assert any(error["code"] == "NON_CONVERGENT_SIMULATION" for error in body["errors"])


# 15: health endpoint remains healthy alongside the new API
def test_health_still_ok_alongside_simulation_api() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# 16: real DFF rising-edge capture via HTTP (Step 21 follow-up #2)
def test_post_sequential_dff_rising_edge_captures_d_via_http() -> None:
    stimulus = {"in_d.out": [[0, 1]], "in_clk.out": [[0, 0], [1, 1]]}
    response = _post_sequential(dff_document(), stimulus, num_timesteps=2)

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert len(body["timesteps"]) == 2
    q_t0 = next(s for s in body["timesteps"][0]["signals"] if s["source_port_id"] == "dff1.q")
    q_t1 = next(s for s in body["timesteps"][1]["signals"] if s["source_port_id"] == "dff1.q")
    assert q_t0["value"] == "x"
    assert q_t1["value"] == "1"


# 17: sequential endpoint still honestly rejects an unsupported kind
def test_post_sequential_semantically_invalid_ir_document_returns_structured_error_not_http_error() -> None:
    response = client.post(
        "/api/simulation/simulate-sequential",
        json={"document": {"id": "doc_1"}, "stimulus": {}, "num_timesteps": 1},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert any(error["code"] == "INVALID_IR_DOCUMENT" for error in body["errors"])


# 18: malformed sequential request -> normal HTTP validation behavior
def test_post_sequential_missing_num_timesteps_returns_422() -> None:
    response = client.post(
        "/api/simulation/simulate-sequential",
        json={"document": to_dict(dff_document()), "stimulus": {}},
    )
    assert response.status_code == 422
