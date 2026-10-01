"""In-process job registry for Step 19 physical-design jobs.

IMPORTANT, HONEST LIMITATION: job state lives ONLY in this process's
memory. A backend restart loses every in-flight job record - `get_job()`
correctly returns None for an unknown id (the API layer reports 404,
never fabricates a "succeeded"/"failed" status for a job it has no real
record of). A best-effort `status.json` is also written into each job's
own work directory purely for manual, post-hoc inspection - it is NOT
read back on startup, since this project has no existing persistence
layer to build that on (see Step 19 investigation: no database, no
Celery/Redis, nothing to reuse) and inventing one was explicitly out of
scope.

Cancellation (Step 20 follow-up): each job also gets its own
`threading.Event` (`_cancel_events`), checked by the running worker
thread's `run_librelane` poll loop. `_update()` refuses to change a job
that is ALREADY in a terminal status (succeeded/failed/timed_out/
cancelled) - this is the one authoritative guard that guarantees a
cancelled job can never later flip to succeeded, regardless of what a
racing background worker thread tries to report afterward.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.domain.physical_design.models import (
    FailureCode,
    JobStatus,
    PhysicalDesignJob,
    PhysicalDesignResult,
)


_TERMINAL_STATUSES = frozenset(
    {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.TIMED_OUT}
)


class JobRegistry:
    def __init__(self, work_root: Path, max_concurrent_jobs: int):
        self._work_root = work_root
        self._jobs: dict[str, PhysicalDesignJob] = {}
        self._cancel_events: dict[str, threading.Event] = {}
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(max_concurrent_jobs)

    def create_job(self, source_document: dict[str, Any] | None = None) -> PhysicalDesignJob:
        job_id = uuid4().hex
        now = datetime.now(timezone.utc)
        job = PhysicalDesignJob(
            job_id=job_id,
            status=JobStatus.QUEUED,
            created_at=now,
            updated_at=now,
            source_document=source_document,
        )
        with self._lock:
            self._jobs[job_id] = job
            self._cancel_events[job_id] = threading.Event()
        self._write_status_file(job)
        return job

    def get_job(self, job_id: str) -> PhysicalDesignJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def job_work_dir(self, job_id: str) -> Path:
        return self._work_root / job_id

    def mark_running(self, job_id: str) -> None:
        self._update(job_id, status=JobStatus.RUNNING)

    def mark_succeeded(self, job_id: str, result: PhysicalDesignResult) -> None:
        self._update(job_id, status=JobStatus.SUCCEEDED, result=result)

    def mark_failed(self, job_id: str, failure_code: str, message: str) -> None:
        self._update(job_id, status=JobStatus.FAILED, failure_code=failure_code, failure_message=message)

    def mark_timed_out(self, job_id: str, message: str) -> None:
        self._update(
            job_id,
            status=JobStatus.TIMED_OUT,
            failure_code=FailureCode.TIMED_OUT,
            failure_message=message,
        )

    def acquire_slot(self, timeout: float | None = None) -> bool:
        return self._semaphore.acquire(timeout=timeout)

    def release_slot(self) -> None:
        self._semaphore.release()

    def get_cancel_event(self, job_id: str) -> "threading.Event | None":
        return self._cancel_events.get(job_id)

    def is_cancel_requested(self, job_id: str) -> bool:
        event = self._cancel_events.get(job_id)
        return event.is_set() if event is not None else False

    def request_cancel(self, job_id: str) -> tuple[PhysicalDesignJob | None, bool]:
        """Signal cancellation for `job_id`. Returns (job, was_cancellable):
        `job` is None only if the job id is unknown. `was_cancellable` is
        True only if the job was genuinely queued/running at the moment of
        the request (and has now been transitioned to CANCELLED) - False
        for a job that was already in a terminal state (nothing to do,
        cannot "cancel" a finished job)."""

        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is None:
                return None, False
            if existing.status in _TERMINAL_STATUSES:
                return existing, False
            updated = existing.model_copy(
                update={
                    "status": JobStatus.CANCELLED,
                    "failure_code": FailureCode.CANCELLED,
                    "failure_message": "Cancelled by user request.",
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self._jobs[job_id] = updated
        event = self._cancel_events.get(job_id)
        if event is not None:
            event.set()
        self._write_status_file(updated)
        return updated, True

    def _update(self, job_id: str, **updates: object) -> None:
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is None:
                return
            if existing.status in _TERMINAL_STATUSES:
                # Never let a late-arriving worker-thread report (success/
                # failure/timeout) overwrite an already-terminal status -
                # this is what guarantees a cancelled job can never later
                # flip to succeeded.
                return
            updated = existing.model_copy(update={**updates, "updated_at": datetime.now(timezone.utc)})
            self._jobs[job_id] = updated
        self._write_status_file(updated)

    def _write_status_file(self, job: PhysicalDesignJob) -> None:
        job_dir = self.job_work_dir(job.job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        (job_dir / "status.json").write_text(job.model_dump_json(indent=2))
