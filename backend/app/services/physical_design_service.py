"""Thin application service for Step 19: orchestrates job lifecycle and
delegates ALL real physical-design work to
app.domain.physical_design.pipeline.run_physical_design(). This module
intentionally contains zero LibreLane-invocation/identity-mapping logic
of its own.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.core.config import get_settings
from app.domain.hdl.generator import generate_verilog
from app.domain.identity.builder import build_design_identity_ledger
from app.domain.identity.models import DesignIdentityLedger, IdentityError
from app.domain.ir.serialization import from_dict
from app.domain.physical_design.gds_models import GdsReadError, GdsRegionResult, GdsSummary
from app.domain.physical_design.gds_reader import read_gds_region, read_gds_summary
from app.domain.physical_design.job_registry import JobRegistry
from app.domain.physical_design.librelane_runner import cancel_librelane_run, find_latest_run_dir
from app.domain.physical_design.models import FailureCode, JobStatus, PhysicalDesignJob
from app.domain.physical_design.pipeline import run_physical_design


@lru_cache
def get_job_registry() -> JobRegistry:
    settings = get_settings()
    return JobRegistry(
        work_root=Path(settings.physical_design_work_root),
        max_concurrent_jobs=settings.physical_design_max_concurrent_jobs,
    )


def start_physical_design_build(document_data: dict[str, Any]) -> tuple[PhysicalDesignJob | None, str | None]:
    """Validates the raw IR payload and creates a queued job. Returns
    (job, None) on success or (None, error_message) for a malformed
    Canonical IR document - the real LibreLane run itself only happens
    later, in run_physical_design_job()."""

    try:
        from_dict(document_data)
    except ValidationError as exc:
        return None, str(exc)

    registry = get_job_registry()
    job = registry.create_job(source_document=document_data)
    return job, None


def run_physical_design_job(job_id: str, document_data: dict[str, Any]) -> None:
    """The real background execution - runs in a FastAPI BackgroundTasks
    worker thread, never on the request-handling coroutine (a real
    LibreLane run takes minutes)."""

    registry = get_job_registry()
    settings = get_settings()

    if not registry.acquire_slot(timeout=0):
        registry.mark_failed(
            job_id,
            FailureCode.TOOL_NOT_AVAILABLE.value,
            "Too many concurrent physical-design jobs are already running; try again later.",
        )
        return

    # A job cancelled while still QUEUED (waiting for a concurrency slot)
    # must never start real work at all once a slot frees up.
    if registry.is_cancel_requested(job_id):
        registry.release_slot()
        return

    try:
        registry.mark_running(job_id)
        if registry.is_cancel_requested(job_id):
            return
        document = from_dict(document_data)
        result = run_physical_design(
            document,
            librelane_binary=settings.librelane_binary,
            timeout_seconds=settings.physical_design_timeout_seconds,
            work_dir=registry.job_work_dir(job_id),
            cancel_event=registry.get_cancel_event(job_id),
        )
        if result.is_valid:
            registry.mark_succeeded(job_id, result)
        else:
            first_error = result.errors[0] if result.errors else None
            code = first_error.code if first_error else FailureCode.UNKNOWN_FLOW_FAILURE.value
            message = first_error.message if first_error else "Unknown failure."
            if code == FailureCode.TIMED_OUT.value:
                registry.mark_timed_out(job_id, message)
            elif code == FailureCode.CANCELLED.value:
                pass  # already CANCELLED via request_cancel(); _update() guards against overwriting it
            else:
                registry.mark_failed(job_id, code, message)
    finally:
        registry.release_slot()


def get_physical_design_job(job_id: str) -> PhysicalDesignJob | None:
    return get_job_registry().get_job(job_id)


def cancel_physical_design_job(job_id: str) -> tuple[PhysicalDesignJob | None, bool]:
    """Requests cancellation of a real physical-design job. Returns
    (job, was_cancellable). `job` is None for an unknown job id.
    `was_cancellable` is False if the job was already in a terminal state
    (succeeded/failed/timed_out/cancelled) - cancelling a finished job is
    a no-op, never an error that could be confused with a real failure.

    For a genuinely RUNNING job, this also directly kills the real
    Docker/LibreLane process for this job's work directory (in addition
    to setting the cancel event the worker thread's own poll loop
    checks) - a real, immediate cancellation, not just a status flag."""

    registry = get_job_registry()
    existing = registry.get_job(job_id)
    if existing is None:
        return None, False

    was_running = existing.status == JobStatus.RUNNING
    updated, was_cancellable = registry.request_cancel(job_id)
    if was_cancellable and was_running:
        cancel_librelane_run(registry.job_work_dir(job_id))
    return updated, was_cancellable


def _find_real_gds_path(job_id: str) -> Path | GdsReadError:
    """Locates the real GDS artifact for a completed job by re-deriving
    the same real run directory pipeline.py already used - never stores
    a redundant path anywhere in the job/result models."""

    registry = get_job_registry()
    job = registry.get_job(job_id)
    if job is None:
        return GdsReadError(code="JOB_NOT_FOUND", message=f"No physical-design job with id '{job_id}' is known to this server.")
    if job.status != JobStatus.SUCCEEDED:
        return GdsReadError(
            code="JOB_NOT_SUCCEEDED",
            message=f"Job '{job_id}' is '{job.status.value}', not succeeded - no real GDS artifact exists yet.",
        )

    run_dir = find_latest_run_dir(registry.job_work_dir(job_id))
    if run_dir is None:
        return GdsReadError(code="GDS_ARTIFACT_NOT_FOUND", message=f"No real run directory found for job '{job_id}'.")

    matches = sorted((run_dir / "final").glob("gds/*.gds"))
    if not matches:
        return GdsReadError(code="GDS_ARTIFACT_NOT_FOUND", message=f"No real GDS file found under job '{job_id}'s final artifacts.")
    return matches[0]


def get_gds_summary_for_job(job_id: str) -> GdsSummary | GdsReadError:
    gds_path = _find_real_gds_path(job_id)
    if isinstance(gds_path, GdsReadError):
        return gds_path

    settings = get_settings()
    return read_gds_summary(
        gds_path,
        librelane_binary=settings.librelane_binary,
        python_binary=settings.gds_reader_python_binary,
        timeout_seconds=settings.gds_reader_timeout_seconds,
    )


def get_gds_region_for_job(
    job_id: str,
    *,
    layer: int,
    datatype: int,
    min_x_um: float,
    min_y_um: float,
    max_x_um: float,
    max_y_um: float,
    limit: int,
) -> GdsRegionResult | GdsReadError:
    gds_path = _find_real_gds_path(job_id)
    if isinstance(gds_path, GdsReadError):
        return gds_path

    settings = get_settings()
    return read_gds_region(
        gds_path,
        layer=layer,
        datatype=datatype,
        min_x_um=min_x_um,
        min_y_um=min_y_um,
        max_x_um=max_x_um,
        max_y_um=max_y_um,
        limit=limit,
        librelane_binary=settings.librelane_binary,
        python_binary=settings.gds_reader_python_binary,
        timeout_seconds=settings.gds_reader_timeout_seconds,
    )


def get_design_identity_for_job(job_id: str) -> DesignIdentityLedger | IdentityError:
    """The unified logical/HDL/physical identity ledger for a succeeded
    job's source design. Never re-runs any real tool - HDL identity is
    cheaply, deterministically re-derived from the job's own stored
    `source_document` via the exact same `generate_verilog()` Step 18
    already ran during the real build (pure function of the document, so
    this always reproduces identical gate_instance_ids/top_level_ports)."""

    registry = get_job_registry()
    job = registry.get_job(job_id)
    if job is None:
        return IdentityError(
            code="JOB_NOT_FOUND",
            message=f"No physical-design job with id '{job_id}' is known to this server.",
        )
    if job.status != JobStatus.SUCCEEDED or job.result is None:
        return IdentityError(
            code="JOB_NOT_SUCCEEDED",
            message=f"Job '{job_id}' is '{job.status.value}', not succeeded - no identity ledger exists yet.",
        )
    if job.source_document is None:
        return IdentityError(
            code="SOURCE_DOCUMENT_UNAVAILABLE",
            message=f"Job '{job_id}' has no stored source document (created before this feature existed) - cannot rebuild HDL identity.",
        )

    document = from_dict(job.source_document)
    hdl_result = generate_verilog(document)
    hdl_module = hdl_result.module if hdl_result.success else None

    return build_design_identity_ledger(
        document,
        hdl_module=hdl_module,
        identity_mapping=job.result.identity_mapping,
    )
