"""HTTP API for Step 19's real physical-design pipeline.

Pure transport/orchestration - contains zero LibreLane-invocation/
identity-mapping logic. A real physical-design build takes minutes, so
this is job-based (unlike Step 18's synchronous /api/synthesis/generate):
POST creates a queued job and returns immediately; GET polls status/
result. The real work always happens in a FastAPI background task,
never on the request-handling coroutine.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from app.domain.identity.models import DesignIdentityLedger, IdentityError
from app.domain.physical_design.gds_models import GdsReadError, GdsRegionResult, GdsSummary
from app.domain.physical_design.models import PhysicalDesignJob
from app.services.physical_design_service import (
    cancel_physical_design_job,
    get_design_identity_for_job,
    get_gds_region_for_job,
    get_gds_summary_for_job,
    get_physical_design_job,
    run_physical_design_job,
    start_physical_design_build,
)

_GDS_ERROR_STATUS_CODES = {
    "JOB_NOT_FOUND": 404,
    "JOB_NOT_SUCCEEDED": 409,
    "GDS_ARTIFACT_NOT_FOUND": 404,
    "GDS_PARSER_NOT_AVAILABLE": 503,
    "GDS_PARSE_TIMED_OUT": 504,
    "GDS_PARSE_FAILED": 500,
}

_IDENTITY_ERROR_STATUS_CODES = {
    "JOB_NOT_FOUND": 404,
    "JOB_NOT_SUCCEEDED": 409,
    "SOURCE_DOCUMENT_UNAVAILABLE": 409,
}


def _raise_for_gds_error(error: GdsReadError) -> None:
    raise HTTPException(status_code=_GDS_ERROR_STATUS_CODES.get(error.code, 500), detail=f"{error.code}: {error.message}")


def _raise_for_identity_error(error: IdentityError) -> None:
    raise HTTPException(status_code=_IDENTITY_ERROR_STATUS_CODES.get(error.code, 500), detail=f"{error.code}: {error.message}")

router = APIRouter(prefix="/api/physical-design", tags=["physical-design"])


class PhysicalDesignBuildRequest(BaseModel):
    """The wire format for POST /api/physical-design/build."""

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]


@router.post(
    "/build",
    response_model=PhysicalDesignJob,
    status_code=202,
    summary="Start a real physical-design build (Step 19) for a primitive-only Canonical IR document.",
    description=(
        "Accepts a Canonical IR document built entirely from primitive "
        "kinds (input/output/AND/OR/NOT) and starts a real LibreLane + "
        "SKY130 + OpenROAD physical-design job in the background - "
        "synthesis, floorplan, PDN, placement, routing, and GDS export, "
        "all against the real toolchain, never mocked. Returns "
        "immediately with a queued job id; poll GET "
        "/api/physical-design/jobs/{job_id} for status/result. A "
        "malformed (non-Canonical-IR) document is rejected immediately "
        "with 422 - never silently queued."
    ),
)
def post_build_physical_design(
    request: PhysicalDesignBuildRequest, background_tasks: BackgroundTasks
) -> PhysicalDesignJob:
    job, error = start_physical_design_build(request.document)
    if job is None:
        raise HTTPException(status_code=422, detail=f"Invalid Canonical IR document: {error}")

    background_tasks.add_task(run_physical_design_job, job.job_id, request.document)
    return job


@router.get(
    "/jobs/{job_id}",
    response_model=PhysicalDesignJob,
    summary="Get the status/result of a Step 19 physical-design job.",
    description=(
        "Job state is in-memory only for this backend process - a job id "
        "created before a backend restart returns 404 rather than a "
        "fabricated status."
    ),
)
def get_physical_design_job_status(job_id: str) -> PhysicalDesignJob:
    job = get_physical_design_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail="No physical-design job with that id is known to this server.",
        )
    return job


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=PhysicalDesignJob,
    summary="Cancel a real, in-progress Step 19 physical-design job.",
    description=(
        "Requests cancellation of a real physical-design job by id. For a "
        "job that is still queued or genuinely running, this transitions "
        "it to 'cancelled' and - for a running job - kills the real "
        "Docker/LibreLane/OpenROAD process for that job's work "
        "directory (never just a status flag). A job already in a "
        "terminal state (succeeded/failed/timed_out/cancelled) cannot be "
        "cancelled - returns 409, never silently no-ops as if it worked."
    ),
)
def post_cancel_physical_design_job(job_id: str) -> PhysicalDesignJob:
    job, was_cancellable = cancel_physical_design_job(job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail="No physical-design job with that id is known to this server.",
        )
    if not was_cancellable:
        raise HTTPException(
            status_code=409,
            detail=f"Job '{job_id}' is already in a terminal state ('{job.status.value}') and cannot be cancelled.",
        )
    return job


@router.get(
    "/jobs/{job_id}/gds/summary",
    response_model=GdsSummary,
    summary="Real GDS metadata for a succeeded Step 19 physical-design job.",
    description=(
        "Parses the job's real GDS artifact (via the real `klayout` "
        "library, never fabricated) and returns real, file-derived "
        "metadata - bounding box, real layer list with real shape counts, "
        "real cell/polygon/path/box/text counts. Always cheap to compute "
        "regardless of how much raw geometry the file contains - use "
        "GET .../gds/region for actual shape geometry within a bounded "
        "viewport. 404 for an unknown job, 409 if the job has not "
        "succeeded (no real GDS exists yet), 503/504/500 for a real "
        "parser/environment failure - never a fabricated empty result."
    ),
)
def get_gds_summary(job_id: str) -> GdsSummary:
    result = get_gds_summary_for_job(job_id)
    if isinstance(result, GdsReadError):
        _raise_for_gds_error(result)
        raise AssertionError("unreachable")  # _raise_for_gds_error always raises
    return result


@router.get(
    "/jobs/{job_id}/gds/region",
    response_model=GdsRegionResult,
    summary="Real GDS shape geometry for one layer within a bounded viewport.",
    description=(
        "Returns REAL polygon/path/box outline points (in real microns, "
        "converted from the GDS file's own database units) for ONE real "
        "(layer, datatype) pair, clipped to the requested viewport - a "
        "real GDS can have hundreds of thousands of shapes, so the full "
        "file is never returned in one response. `truncated=true` "
        "honestly signals more shapes exist in this region beyond `limit`."
    ),
)
def get_gds_region(
    job_id: str,
    layer: int,
    datatype: int,
    min_x_um: float,
    min_y_um: float,
    max_x_um: float,
    max_y_um: float,
    limit: int = Query(default=2000, ge=1, le=5000),
) -> GdsRegionResult:
    result = get_gds_region_for_job(
        job_id,
        layer=layer,
        datatype=datatype,
        min_x_um=min_x_um,
        min_y_um=min_y_um,
        max_x_um=max_x_um,
        max_y_um=max_y_um,
        limit=limit,
    )
    if isinstance(result, GdsReadError):
        _raise_for_gds_error(result)
        raise AssertionError("unreachable")  # _raise_for_gds_error always raises
    return result


@router.get(
    "/jobs/{job_id}/identity",
    response_model=DesignIdentityLedger,
    summary="Unified logical/HDL/physical identity ledger for a succeeded job's source design.",
    description=(
        "One canonical, per-component view of identity across every "
        "representation layer this platform can currently back with real "
        "evidence: the source Canonical IR component, its generated "
        "Verilog HDL instance name (Step 18), and its real placed "
        "DEF/GDS physical cell name(s) (Step 19) - never a fabricated "
        "mapping. Connection-level identity is always reported "
        "'unavailable', matching the existing physical identity mapping's "
        "own honesty guarantee. 404 for an unknown job, 409 if the job "
        "has not succeeded yet or predates this feature (no stored "
        "source document to rebuild HDL identity from)."
    ),
)
def get_design_identity(job_id: str) -> DesignIdentityLedger:
    result = get_design_identity_for_job(job_id)
    if isinstance(result, IdentityError):
        _raise_for_identity_error(result)
        raise AssertionError("unreachable")  # _raise_for_identity_error always raises
    return result

