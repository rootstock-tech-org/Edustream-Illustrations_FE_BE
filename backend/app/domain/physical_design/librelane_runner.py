"""run_librelane(...) -> LibreLaneRunOutcome

Invokes the REAL LibreLane CLI (never a mock, never a fabricated result)
against a real, per-job work directory. Always forces
`SYNTH_HIERARCHY_MODE=keep` - the pre-implementation calibration
experiments proved this is load-bearing for canonical identity survival;
LibreLane's own default ("flatten") would destroy it.

Process safety: builds the command as an argument list (never
`shell=True`), runs with an explicit timeout, and - on timeout/
cancellation - ALSO issues a real `docker kill` against the specific
container LibreLane's own `--dockerized` mode launched. This second step
is not optional: the pre-implementation cancellation experiment PROVED
that terminating only the wrapping Python/shell process leaves the
Docker container (and everything inside it) running indefinitely.

REAL BUG FOUND (Step 20 cancellation follow-up) + FIXED: killing only the
DIRECT child process (`process.kill()`) does NOT reliably terminate any
further children IT forked (e.g. LibreLane's own CLI, or a plain shell
script, forking a child process that inherits the stdout/stderr pipes) -
`communicate()` then blocks until that orphaned grandchild exits
naturally, which can take as long as the ORIGINAL run would have,
completely defeating the point of cancelling it. Verified directly via a
standalone repro (a fake `bash -c "sleep 60"` script: `process.kill()`
alone left `communicate()` blocked for the full 60s despite killing the
immediate child at the 1s mark). FIX: launch with
`start_new_session=True` (a new POSIX process group) and kill the WHOLE
group via `os.killpg(os.getpgid(pid), SIGKILL)` - verified this resolves
the repro immediately (communicate() returns within the same second the
group is killed, not 60s later).

SECOND REAL BUG FOUND (Step 20 cancellation follow-up, MORE SERIOUS) +
FIXED: `docker ps --filter ancestor=ghcr.io/librelane/librelane` (no
tag) matches NOTHING against a real running container whose image is
`ghcr.io/librelane/librelane:3.0.14` - Docker's `ancestor` filter
requires an exact repo[:tag] (or image id) match, and a bare repo name
with no tag does NOT implicitly match a tagged image in this Docker
version. This means the container-kill path had been silently a
NO-OP in production the whole time (verified live: a real cancel
request correctly flipped the job's status to "cancelled" but left the
real Docker container AND its internal LibreLane/OpenROAD processes
running uninterrupted). FIX: list all running containers
(`docker ps --format {{.ID}}\t{{.Image}}`) and match the image's
REPOSITORY portion (split on the LAST ':') against
`_LIBRELANE_DOCKER_IMAGE` in Python - robust to any tag (3.0.14, latest,
a future version), never depends on Docker's own filter syntax matching
exactly.
Because LibreLane does not expose its own container's name/id to the
caller, the container is identified by matching BOTH the known image
(`ghcr.io/librelane/librelane`) AND the container's working directory
against this job's own unique work directory - a deterministic,
verifiable match (every job gets its own directory, never shared).

User-requested cancellation (a `threading.Event` passed in as
`cancel_event`) uses the SAME `_kill_process_and_container` mechanism as
timeout - `communicate()` is polled in short intervals (never one giant
blocking call) so a cancel request set from a different thread is
noticed within one poll tick, empirically verified safe via a standalone
repeated-poll experiment before use here (see repo memory).
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.domain.hdl.generator import HdlModule
from app.domain.physical_design.sizing import choose_die_sizing

_LIBRELANE_DOCKER_IMAGE = "ghcr.io/librelane/librelane"


@dataclass(frozen=True)
class LibreLaneRunOutcome:
    success: bool
    run_dir: Path | None = None
    stdout: str = ""
    stderr: str = ""
    message: str = ""
    failure_reason: str | None = None
    timed_out: bool = False
    cancelled: bool = False


def write_librelane_config(
    work_dir: Path,
    hdl_module: HdlModule,
    *,
    component_count: int,
) -> Path:
    """Write design.v + config.json into `work_dir` and return the config
    path. Always forces SYNTH_HIERARCHY_MODE=keep - never left to
    LibreLane's own default."""

    src_dir = work_dir / "src"
    src_dir.mkdir(parents=True, exist_ok=True)
    (src_dir / "design.v").write_text(hdl_module.verilog)

    sizing = choose_die_sizing(component_count)
    config = {
        "DESIGN_NAME": hdl_module.module_name,
        "VERILOG_FILES": "dir::src/design.v",
        "CLOCK_PORT": None,
        "CLOCK_PERIOD": 10,
        "SYNTH_HIERARCHY_MODE": "keep",
        "FP_SIZING": "absolute",
        "DIE_AREA": f"0 0 {sizing.die_width_um:.0f} {sizing.die_height_um:.0f}",
        "PL_TARGET_DENSITY": sizing.pl_target_density,
    }
    config_path = work_dir / "config.json"
    config_path.write_text(json.dumps(config, indent=2))
    return config_path


_POLL_INTERVAL_SECONDS = 0.5


def run_librelane(
    librelane_binary: str,
    config_path: Path,
    *,
    timeout_seconds: float,
    cancel_event: "threading.Event | None" = None,
) -> LibreLaneRunOutcome:
    work_dir = config_path.parent

    try:
        process = subprocess.Popen(
            [librelane_binary, "--docker-no-tty", "--dockerized", str(config_path)],
            cwd=str(work_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
    except FileNotFoundError:
        return LibreLaneRunOutcome(
            success=False,
            message=f"LibreLane executable not found at '{librelane_binary}'.",
            failure_reason="TOOL_NOT_AVAILABLE",
        )

    deadline = time.monotonic() + timeout_seconds
    stdout = stderr = ""
    while True:
        try:
            stdout, stderr = process.communicate(timeout=_POLL_INTERVAL_SECONDS)
            break
        except subprocess.TimeoutExpired:
            if cancel_event is not None and cancel_event.is_set():
                _kill_process_and_container(process, work_dir)
                stdout, stderr = process.communicate()
                return LibreLaneRunOutcome(
                    success=False,
                    run_dir=_latest_run_dir(work_dir),
                    stdout=stdout,
                    stderr=stderr,
                    message="Cancelled by user request.",
                    failure_reason="CANCELLED",
                    cancelled=True,
                )
            if time.monotonic() >= deadline:
                _kill_process_and_container(process, work_dir)
                stdout, stderr = process.communicate()
                return LibreLaneRunOutcome(
                    success=False,
                    run_dir=_latest_run_dir(work_dir),
                    stdout=stdout,
                    stderr=stderr,
                    message=f"LibreLane did not complete within {timeout_seconds} second(s).",
                    failure_reason="TIMED_OUT",
                    timed_out=True,
                )

    run_dir = _latest_run_dir(work_dir)
    if process.returncode != 0 or run_dir is None:
        return LibreLaneRunOutcome(
            success=False,
            run_dir=run_dir,
            stdout=stdout,
            stderr=stderr,
            message=f"LibreLane flow failed (exit code {process.returncode}).",
            failure_reason="UNKNOWN_FLOW_FAILURE",
        )

    return LibreLaneRunOutcome(success=True, run_dir=run_dir, stdout=stdout, stderr=stderr, message="Flow complete.")


def cancel_librelane_run(work_dir: Path) -> None:
    """Best-effort cancellation for a job whose subprocess handle is no
    longer directly controllable (e.g. after a backend restart). Finds
    and kills the real Docker container by image + working-directory
    match - see module docstring for why this indirection is required."""

    _kill_container_for_workdir(work_dir)


def _kill_process_and_container(process: subprocess.Popen, work_dir: Path) -> None:
    _kill_container_for_workdir(work_dir)
    try:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except ProcessLookupError:
        pass  # the whole group (including any grandchildren) already exited


def _kill_container_for_workdir(work_dir: Path) -> None:
    try:
        ps_result = subprocess.run(
            ["docker", "ps", "--format", "{{.ID}}\t{{.Image}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return

    container_ids = []
    for line in ps_result.stdout.splitlines():
        if "\t" not in line:
            continue
        container_id, image = line.split("\t", 1)
        # Match the image's repository portion only (ignore the tag) -
        # Docker's own `--filter ancestor=` requires an EXACT repo:tag
        # match and silently matches nothing otherwise (the real bug
        # this replaced - see module docstring).
        repository = image.rsplit(":", 1)[0]
        if repository == _LIBRELANE_DOCKER_IMAGE:
            container_ids.append(container_id)

    for container_id in container_ids:
        try:
            inspect_result = subprocess.run(
                ["docker", "inspect", "--format", "{{.Config.WorkingDir}}", container_id],
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            continue
        if inspect_result.stdout.strip() == str(work_dir):
            subprocess.run(["docker", "kill", container_id], capture_output=True, timeout=10)


def _latest_run_dir(work_dir: Path) -> Path | None:
    runs_dir = work_dir / "runs"
    if not runs_dir.is_dir():
        return None
    candidates = sorted(p for p in runs_dir.iterdir() if p.is_dir())
    return candidates[-1] if candidates else None


def find_latest_run_dir(work_dir: Path) -> Path | None:
    """Public accessor for a completed job's real run directory - reused
    by the GDS viewer (Step 20 follow-up) to relocate the same real
    artifacts pipeline.py already collected, without persisting a
    redundant path anywhere in the job/result models."""

    return _latest_run_dir(work_dir)
