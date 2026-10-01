import tempfile
from pathlib import Path

from app.domain.physical_design.job_registry import JobRegistry
from app.domain.physical_design.models import FailureCode, JobStatus, PhysicalDesignResult


def _registry() -> JobRegistry:
    return JobRegistry(work_root=Path(tempfile.mkdtemp()), max_concurrent_jobs=2)


def test_new_job_starts_queued_with_its_own_cancel_event() -> None:
    registry = _registry()
    job = registry.create_job()

    assert job.status == JobStatus.QUEUED
    assert registry.is_cancel_requested(job.job_id) is False
    assert registry.get_cancel_event(job.job_id) is not None


def test_request_cancel_on_queued_job_transitions_to_cancelled() -> None:
    registry = _registry()
    job = registry.create_job()

    updated, was_cancellable = registry.request_cancel(job.job_id)

    assert was_cancellable is True
    assert updated is not None
    assert updated.status == JobStatus.CANCELLED
    assert updated.failure_code == FailureCode.CANCELLED
    assert registry.is_cancel_requested(job.job_id) is True


def test_request_cancel_on_running_job_transitions_to_cancelled() -> None:
    registry = _registry()
    job = registry.create_job()
    registry.mark_running(job.job_id)

    updated, was_cancellable = registry.request_cancel(job.job_id)

    assert was_cancellable is True
    assert updated.status == JobStatus.CANCELLED


def test_request_cancel_on_unknown_job_id_returns_none() -> None:
    registry = _registry()

    updated, was_cancellable = registry.request_cancel("does-not-exist")

    assert updated is None
    assert was_cancellable is False


def test_request_cancel_on_already_succeeded_job_is_a_no_op() -> None:
    registry = _registry()
    job = registry.create_job()
    registry.mark_running(job.job_id)
    registry.mark_succeeded(job.job_id, PhysicalDesignResult(is_valid=True))

    updated, was_cancellable = registry.request_cancel(job.job_id)

    assert was_cancellable is False
    assert updated.status == JobStatus.SUCCEEDED  # unchanged, never overwritten


def test_a_cancelled_job_can_never_later_become_succeeded() -> None:
    """The core race-safety guarantee: once CANCELLED, a late-arriving
    worker-thread report must never flip the job back to a different
    terminal status."""

    registry = _registry()
    job = registry.create_job()
    registry.mark_running(job.job_id)
    registry.request_cancel(job.job_id)

    # Simulate the background worker thread finishing its real work AFTER
    # the cancel request already landed - these must all be no-ops.
    registry.mark_succeeded(job.job_id, PhysicalDesignResult(is_valid=True))
    registry.mark_failed(job.job_id, "SOME_FAILURE", "irrelevant")
    registry.mark_timed_out(job.job_id, "irrelevant")

    final = registry.get_job(job.job_id)
    assert final.status == JobStatus.CANCELLED


def test_cancelling_an_already_cancelled_job_is_a_no_op_second_time() -> None:
    registry = _registry()
    job = registry.create_job()

    first_updated, first_cancellable = registry.request_cancel(job.job_id)
    second_updated, second_cancellable = registry.request_cancel(job.job_id)

    assert first_cancellable is True
    assert second_cancellable is False
    assert second_updated.status == JobStatus.CANCELLED
