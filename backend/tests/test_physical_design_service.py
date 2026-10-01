import threading
import time
from pathlib import Path
from unittest.mock import patch

from app.domain.ir.examples import and_gate_document
from app.domain.ir.serialization import to_dict
from app.domain.physical_design.job_registry import JobRegistry
from app.domain.physical_design.models import JobStatus, PhysicalDesignResult
from app.services import physical_design_service


def _fresh_registry(tmp_path: Path) -> JobRegistry:
    return JobRegistry(work_root=tmp_path, max_concurrent_jobs=2)


def test_cancelling_a_genuinely_running_job_transitions_it_to_cancelled_and_stays_cancelled(tmp_path: Path) -> None:
    """The real mid-flight race this feature exists for: a job is
    genuinely RUNNING (the real pipeline call is in-flight, blocked on a
    controllable event standing in for a real multi-minute LibreLane
    run) when a cancel request arrives from a different thread. Exercised
    directly against the service layer - bypassing FastAPI's TestClient,
    which (confirmed empirically) runs BackgroundTasks to completion
    before returning control to the caller, making a genuine mid-flight
    race impossible to observe through the HTTP layer in this
    environment."""

    registry = _fresh_registry(tmp_path)
    document_data = to_dict(and_gate_document())

    release = threading.Event()
    reached_running = threading.Event()

    def _blocked_pipeline_call(*args, **kwargs):
        reached_running.set()
        release.wait(timeout=10)
        return PhysicalDesignResult(is_valid=True)

    with (
        patch.object(physical_design_service, "get_job_registry", return_value=registry),
        patch.object(physical_design_service, "run_physical_design", side_effect=_blocked_pipeline_call),
        patch.object(physical_design_service, "cancel_librelane_run") as mocked_kill,
    ):
        job = registry.create_job()
        worker = threading.Thread(
            target=physical_design_service.run_physical_design_job,
            args=(job.job_id, document_data),
            daemon=True,
        )
        worker.start()

        assert reached_running.wait(timeout=5), "worker never reached the real pipeline call"
        assert registry.get_job(job.job_id).status == JobStatus.RUNNING

        updated, was_cancellable = physical_design_service.cancel_physical_design_job(job.job_id)

        release.set()  # let the blocked pipeline call return, simulating real completion
        worker.join(timeout=5)

    assert was_cancellable is True
    assert updated.status == JobStatus.CANCELLED
    # The real Docker/LibreLane process-kill path must be invoked for a
    # genuinely running job - never just a status flag.
    mocked_kill.assert_called_once()

    # Even though the (fake) pipeline call went on to "succeed" after
    # release.set(), the job must stay CANCELLED - this is the core
    # "never later becomes succeeded" guarantee.
    final = registry.get_job(job.job_id)
    assert final.status == JobStatus.CANCELLED


def test_cancelling_a_still_queued_job_never_starts_the_real_pipeline(tmp_path: Path) -> None:
    """A job cancelled before the worker thread even starts real work
    (e.g. still waiting for a concurrency slot) must never invoke the
    real pipeline at all once a slot frees up."""

    registry = _fresh_registry(tmp_path)
    document_data = to_dict(and_gate_document())

    with (
        patch.object(physical_design_service, "get_job_registry", return_value=registry),
        patch.object(physical_design_service, "run_physical_design") as mocked_pipeline,
    ):
        job = registry.create_job()
        updated, was_cancellable = physical_design_service.cancel_physical_design_job(job.job_id)
        assert was_cancellable is True
        assert updated.status == JobStatus.CANCELLED

        # Only now does the worker thread actually get to run (simulating
        # a slot freeing up after the cancel already landed).
        physical_design_service.run_physical_design_job(job.job_id, document_data)

    mocked_pipeline.assert_not_called()
    assert registry.get_job(job.job_id).status == JobStatus.CANCELLED


def test_cancelling_an_unknown_job_id_returns_none() -> None:
    updated, was_cancellable = physical_design_service.cancel_physical_design_job("does-not-exist")

    assert updated is None
    assert was_cancellable is False
