import shutil
import time

import pytest
from fastapi.testclient import TestClient

from app.domain.ir.examples import and_gate_document, dff_document
from app.domain.ir.serialization import to_dict
from app.main import app

client = TestClient(app)

_LIBRELANE_BINARY = "/home/rahulg/experiments/step19_identity/.venv-librelane/bin/librelane"
_LIBRELANE_AVAILABLE = shutil.which(_LIBRELANE_BINARY) is not None or shutil.which("librelane") is not None


def test_malformed_document_is_rejected_with_422_never_silently_queued() -> None:
    response = client.post("/api/physical-design/build", json={"document": {"not": "a real document"}})

    assert response.status_code == 422


def test_unknown_job_id_returns_404_not_a_fabricated_status() -> None:
    response = client.get("/api/physical-design/jobs/does-not-exist")

    assert response.status_code == 404


def test_cancel_unknown_job_id_returns_404() -> None:
    response = client.post("/api/physical-design/jobs/does-not-exist/cancel")

    assert response.status_code == 404


def test_cancel_route_returns_the_real_service_layer_result_verbatim() -> None:
    # Starlette's TestClient runs a route's BackgroundTasks to completion
    # BEFORE client.post() returns control here (confirmed empirically -
    # a genuine mid-flight "cancel a still-running real job" race is
    # exercised directly against the service layer instead, in
    # tests/test_physical_design_service.py, bypassing TestClient
    # entirely). This test only verifies the API layer's own thin
    # wiring: it calls cancel_physical_design_job and returns exactly
    # what that function reports, nothing more.
    from unittest.mock import patch

    from app.domain.physical_design.models import FailureCode, JobStatus, PhysicalDesignJob
    from datetime import datetime, timezone

    cancelled_job = PhysicalDesignJob(
        job_id="job-123",
        status=JobStatus.CANCELLED,
        failure_code=FailureCode.CANCELLED,
        failure_message="Cancelled by user request.",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    with patch(
        "app.api.physical_design.cancel_physical_design_job",
        return_value=(cancelled_job, True),
    ):
        response = client.post("/api/physical-design/jobs/job-123/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["job_id"] == "job-123"


def test_cancel_an_already_succeeded_job_returns_409() -> None:
    from unittest.mock import patch

    from app.domain.physical_design.models import PhysicalDesignResult

    with patch(
        "app.services.physical_design_service.run_physical_design",
        return_value=PhysicalDesignResult(is_valid=True),
    ):
        build_response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})
        job_id = build_response.json()["job_id"]

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            status = client.get(f"/api/physical-design/jobs/{job_id}").json()["status"]
            if status == "succeeded":
                break
            time.sleep(0.1)

    cancel_response = client.post(f"/api/physical-design/jobs/{job_id}/cancel")

    assert cancel_response.status_code == 409


def test_valid_document_is_queued_immediately() -> None:
    # Patches the real LibreLane pipeline call so this test never triggers
    # a real, multi-minute physical-design run regardless of whether
    # LibreLane happens to be installed in this environment - the real,
    # unpatched end-to-end behavior is covered separately by the
    # LibreLane-gated test below.
    from unittest.mock import patch

    from app.domain.physical_design.models import PhysicalDesignResult

    with patch(
        "app.services.physical_design_service.run_physical_design",
        return_value=PhysicalDesignResult(is_valid=True),
    ):
        response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})

    assert response.status_code == 202
    body = response.json()
    assert body["status"] in ("queued", "running", "succeeded", "failed")
    assert body["job_id"]


def test_identity_ledger_for_unknown_job_returns_404() -> None:
    response = client.get("/api/physical-design/jobs/does-not-exist/identity")

    assert response.status_code == 404


def test_identity_ledger_for_a_queued_job_returns_409_not_a_fabricated_ledger() -> None:
    from unittest.mock import patch

    # Never let the background task actually run to completion here - a
    # genuinely still-queued/running job's identity ledger must be 409,
    # never a fabricated partial result.
    with patch("app.api.physical_design.run_physical_design_job", return_value=None):
        build_response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})
        job_id = build_response.json()["job_id"]

    response = client.get(f"/api/physical-design/jobs/{job_id}/identity")

    assert response.status_code == 409


def test_identity_ledger_for_a_succeeded_job_reflects_real_hdl_and_physical_identity() -> None:
    from unittest.mock import patch

    from app.domain.physical_design.mapping import build_identity_mapping
    from app.domain.physical_design.models import PhysicalDesignResult
    from app.domain.hdl.generator import generate_verilog

    hdl_module = generate_verilog(and_gate_document()).module
    fixture_def = f"""
DESIGN m_doc_and_gate ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 300000 300000 ) ;
COMPONENTS 1 ;
- and1 sky130_fd_sc_hd__and2_2 + PLACED ( 10580 146880 ) N ;
END COMPONENTS
"""
    identity_mapping = build_identity_mapping(fixture_def, hdl_module)

    with patch(
        "app.services.physical_design_service.run_physical_design",
        return_value=PhysicalDesignResult(is_valid=True, identity_mapping=identity_mapping),
    ):
        build_response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})
        job_id = build_response.json()["job_id"]

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            status = client.get(f"/api/physical-design/jobs/{job_id}").json()["status"]
            if status == "succeeded":
                break
            time.sleep(0.1)

    response = client.get(f"/api/physical-design/jobs/{job_id}/identity")

    assert response.status_code == 200
    body = response.json()
    assert body["hdl_module_name"] == hdl_module.module_name
    records_by_id = {r["canonical_component_id"]: r for r in body["records"]}
    assert records_by_id["and1"]["hdl_instance_name"] == hdl_module.gate_instance_ids["and1"]
    assert records_by_id["and1"]["physical_cell_names"] == ["and1"]
    assert set(records_by_id["and1"]["layers_present"]) == {"logical", "hdl", "physical"}


@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="LibreLane is not installed in this environment")
def test_real_and_gate_build_reaches_succeeded_via_the_real_api() -> None:
    response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})
    assert response.status_code == 202
    job_id = response.json()["job_id"]

    deadline = time.monotonic() + 900
    status = None
    body = None
    while time.monotonic() < deadline:
        status_response = client.get(f"/api/physical-design/jobs/{job_id}")
        assert status_response.status_code == 200
        body = status_response.json()
        status = body["status"]
        if status in ("succeeded", "failed", "timed_out", "cancelled"):
            break
        time.sleep(2)

    assert status == "succeeded", body
    assert body["result"]["is_valid"] is True
    assert body["result"]["signoff"]["drc_passed"] is True
    assert body["result"]["signoff"]["lvs_passed"] is True
    mapping_by_id = {
        m["canonical_component_id"]: m for m in body["result"]["identity_mapping"]["component_mappings"]
    }
    assert mapping_by_id["and1"]["physical_cell_names"] == ["and1/_0_"]

    identity_response = client.get(f"/api/physical-design/jobs/{job_id}/identity")
    assert identity_response.status_code == 200
    identity_body = identity_response.json()
    records_by_id = {r["canonical_component_id"]: r for r in identity_body["records"]}
    assert records_by_id["and1"]["physical_cell_names"] == ["and1/_0_"]
    assert records_by_id["and1"]["hdl_instance_name"] == "and1"
    assert set(records_by_id["and1"]["layers_present"]) == {"logical", "hdl", "physical"}


@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="LibreLane is not installed in this environment")
def test_real_dff_build_reaches_succeeded_via_the_real_api() -> None:
    """Step 21 follow-up: proves a real SEQUENTIAL (not just combinational)
    canonical component travels all the way through the real LibreLane/
    OpenROAD/SKY130 flow. Manually verified once before writing this test
    (see the Step 21 follow-up final report) - real Yosys/LibreLane maps
    the generated DFF to a real `sky130_fd_sc_hd__dfxtp_2` standard cell,
    with the 'dff1' submodule instance name surviving as the real
    'dff1/_0_' placed-cell path prefix, exactly like the combinational
    AND-gate case above."""

    response = client.post("/api/physical-design/build", json={"document": to_dict(dff_document())})
    assert response.status_code == 202
    job_id = response.json()["job_id"]

    deadline = time.monotonic() + 900
    status = None
    body = None
    while time.monotonic() < deadline:
        status_response = client.get(f"/api/physical-design/jobs/{job_id}")
        assert status_response.status_code == 200
        body = status_response.json()
        status = body["status"]
        if status in ("succeeded", "failed", "timed_out", "cancelled"):
            break
        time.sleep(2)

    assert status == "succeeded", body
    assert body["result"]["is_valid"] is True
    assert body["result"]["signoff"]["drc_passed"] is True
    assert body["result"]["signoff"]["lvs_passed"] is True
    mapping_by_id = {
        m["canonical_component_id"]: m for m in body["result"]["identity_mapping"]["component_mappings"]
    }
    assert mapping_by_id["dff1"]["physical_cell_names"] == ["dff1/_0_"]

    identity_response = client.get(f"/api/physical-design/jobs/{job_id}/identity")
    assert identity_response.status_code == 200
    identity_body = identity_response.json()
    records_by_id = {r["canonical_component_id"]: r for r in identity_body["records"]}
    assert records_by_id["dff1"]["physical_cell_names"] == ["dff1/_0_"]
    assert records_by_id["dff1"]["hdl_instance_name"] == "dff1"
    assert set(records_by_id["dff1"]["layers_present"]) == {"logical", "hdl", "physical"}
