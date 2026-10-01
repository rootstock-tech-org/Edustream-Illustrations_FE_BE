import shutil
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.domain.physical_design.job_registry import JobRegistry
from app.domain.physical_design.models import JobStatus, PhysicalDesignResult
from app.main import app

client = TestClient(app)

_FIXTURE_GDS = Path(__file__).resolve().parent / "fixtures" / "gds" / "and_gate.gds"
_LIBRELANE_BINARY = "/home/rahulg/experiments/step19_identity/.venv-librelane/bin/librelane"
_REAL_KLAYOUT_AVAILABLE = shutil.which(_LIBRELANE_BINARY) is not None or shutil.which("librelane") is not None


def test_gds_summary_for_unknown_job_returns_404() -> None:
    response = client.get("/api/physical-design/jobs/does-not-exist/gds/summary")

    assert response.status_code == 404


def test_gds_region_for_unknown_job_returns_404() -> None:
    response = client.get(
        "/api/physical-design/jobs/does-not-exist/gds/region",
        params={"layer": 68, "datatype": 20, "min_x_um": 0, "min_y_um": 0, "max_x_um": 10, "max_y_um": 10},
    )

    assert response.status_code == 404


def test_gds_summary_for_a_queued_job_returns_409_not_a_fabricated_result() -> None:
    from app.domain.ir.examples import and_gate_document
    from app.domain.ir.serialization import to_dict

    with patch(
        "app.services.physical_design_service.run_physical_design",
        return_value=PhysicalDesignResult(is_valid=False),
    ):
        build_response = client.post("/api/physical-design/build", json={"document": to_dict(and_gate_document())})
    job_id = build_response.json()["job_id"]

    response = client.get(f"/api/physical-design/jobs/{job_id}/gds/summary")

    assert response.status_code == 409


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _REAL_KLAYOUT_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_gds_summary_and_region_for_a_real_succeeded_job(tmp_path: Path) -> None:
    """Builds a REAL succeeded job's on-disk shape (using the real fixture
    GDS, not a fake one) inside a fresh, isolated JobRegistry - avoids a
    slow real multi-minute LibreLane run for this API-contract test while
    still exercising the ENTIRE real parsing stack (subprocess bridge into
    the real klayout venv) against a REAL GDS file end-to-end."""

    registry = JobRegistry(work_root=tmp_path, max_concurrent_jobs=1)
    job = registry.create_job()
    registry.mark_running(job.job_id)
    registry.mark_succeeded(job.job_id, PhysicalDesignResult(is_valid=True))

    run_dir = registry.job_work_dir(job.job_id) / "runs" / "RUN_test"
    gds_dir = run_dir / "final" / "gds"
    gds_dir.mkdir(parents=True)
    shutil.copy(_FIXTURE_GDS, gds_dir / "m_doc_and_gate.gds")

    with patch("app.services.physical_design_service.get_job_registry", return_value=registry):
        summary_response = client.get(f"/api/physical-design/jobs/{job.job_id}/gds/summary")
        assert summary_response.status_code == 200, summary_response.text
        summary = summary_response.json()
        assert summary["top_cell_name"] == "m_doc_and_gate"
        assert summary["bounding_box"]["max_x_um"] == 300.0

        region_response = client.get(
            f"/api/physical-design/jobs/{job.job_id}/gds/region",
            params={"layer": 68, "datatype": 20, "min_x_um": 0, "min_y_um": 0, "max_x_um": 50, "max_y_um": 50, "limit": 100},
        )
        assert region_response.status_code == 200, region_response.text
        region = region_response.json()
        assert region["layer"] == 68
        assert len(region["shapes"]) > 0


def test_gds_region_rejects_a_limit_above_the_hard_cap() -> None:
    response = client.get(
        "/api/physical-design/jobs/does-not-exist/gds/region",
        params={"layer": 68, "datatype": 20, "min_x_um": 0, "min_y_um": 0, "max_x_um": 10, "max_y_um": 10, "limit": 999999},
    )

    assert response.status_code == 422  # FastAPI's own query-param validation, before the job lookup even runs
