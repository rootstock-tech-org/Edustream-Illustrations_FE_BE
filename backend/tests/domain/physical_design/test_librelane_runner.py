import json
import os
import shutil
import stat
import tempfile
import threading
import time
from pathlib import Path

import pytest

from app.domain.hdl.generator import generate_verilog
from app.domain.ir.examples import and_gate_document
from app.domain.physical_design.librelane_runner import run_librelane, write_librelane_config


def _hdl_module():
    result = generate_verilog(and_gate_document())
    assert result.success
    return result.module


def test_write_librelane_config_always_forces_keep_hierarchy() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)
        config = json.loads(config_path.read_text())

    assert config["SYNTH_HIERARCHY_MODE"] == "keep"
    assert config["DESIGN_NAME"] == "m_doc_and_gate"
    assert config["CLOCK_PORT"] is None


def test_write_librelane_config_uses_calibrated_die_sizing() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)
        config = json.loads(config_path.read_text())

    assert config["FP_SIZING"] == "absolute"
    assert config["DIE_AREA"] == "0 0 300 300"


def test_write_librelane_config_writes_the_real_generated_verilog() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        module = _hdl_module()
        config_path = write_librelane_config(Path(tmp), module, component_count=4)
        design_v = (config_path.parent / "src" / "design.v").read_text()

    assert design_v == module.verilog


def test_missing_librelane_binary_is_an_honest_structured_failure() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)
        outcome = run_librelane("/nonexistent/librelane-binary", config_path, timeout_seconds=5)

    assert outcome.success is False
    assert outcome.failure_reason == "TOOL_NOT_AVAILABLE"


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash is required for this fake-binary test")
def test_timeout_is_reported_honestly_and_kills_the_process() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)

        fake_binary = Path(tmp) / "fake_librelane.sh"
        fake_binary.write_text("#!/bin/bash\nsleep 60\n")
        fake_binary.chmod(fake_binary.stat().st_mode | stat.S_IEXEC)

        outcome = run_librelane(str(fake_binary), config_path, timeout_seconds=1)

    assert outcome.success is False
    assert outcome.timed_out is True
    assert outcome.failure_reason == "TIMED_OUT"


def test_run_failure_with_nonzero_exit_is_reported_honestly() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)

        fake_binary = Path(tmp) / "fake_librelane_fail.sh"
        fake_binary.write_text("#!/bin/bash\nexit 1\n")
        fake_binary.chmod(fake_binary.stat().st_mode | stat.S_IEXEC)

        outcome = run_librelane(str(fake_binary), config_path, timeout_seconds=10)

    assert outcome.success is False
    assert outcome.failure_reason == "UNKNOWN_FLOW_FAILURE"


@pytest.mark.skipif(shutil.which("bash") is None, reason="bash is required for this fake-binary test")
def test_cancellation_is_reported_honestly_and_kills_the_whole_process_tree() -> None:
    """Regression test for a REAL bug found while wiring cancellation: a
    naive `process.kill()` only kills the DIRECT child - if that child
    forks a further child (exactly what a plain shell script does for an
    external command), the orphaned grandchild keeps the inherited
    stdout/stderr pipes open and `communicate()` blocks until IT exits
    naturally - here, the full 60s sleep, completely defeating
    cancellation. Fixed via `start_new_session=True` + `os.killpg(...)`;
    this test asserts cancellation completes in low single-digit seconds,
    never anywhere near the fake binary's full 60s runtime."""

    with tempfile.TemporaryDirectory() as tmp:
        config_path = write_librelane_config(Path(tmp), _hdl_module(), component_count=4)

        fake_binary = Path(tmp) / "fake_librelane_slow.sh"
        fake_binary.write_text("#!/bin/bash" + chr(10) + "sleep 60" + chr(10))
        fake_binary.chmod(fake_binary.stat().st_mode | stat.S_IEXEC)

        cancel_event = threading.Event()

        def _cancel_shortly() -> None:
            time.sleep(1)
            cancel_event.set()

        threading.Thread(target=_cancel_shortly, daemon=True).start()

        start = time.monotonic()
        outcome = run_librelane(str(fake_binary), config_path, timeout_seconds=120, cancel_event=cancel_event)
        elapsed = time.monotonic() - start

    assert outcome.success is False
    assert outcome.cancelled is True
    assert outcome.timed_out is False
    assert outcome.failure_reason == "CANCELLED"
    assert elapsed < 10, f"cancellation should be near-immediate, took {elapsed:.1f}s (process-tree not fully killed?)"


def test_kill_container_for_workdir_matches_a_tagged_container() -> None:
    """Regression test for a REAL bug found while doing a live end-to-end
    cancellation experiment: `docker ps --filter ancestor=<repo>` (no
    tag) matches NOTHING against a real container running a TAGGED
    image (e.g. `ghcr.io/librelane/librelane:3.0.14`) - the cancel path
    silently became a no-op that never actually killed the real
    container. Verified live: a cancelled job's real Docker/LibreLane/
    OpenROAD processes kept running to completion in the background
    despite the job's status correctly flipping to 'cancelled'. Fixed
    by matching the image's repository portion (splitting off the tag)
    in Python instead of relying on Docker's own `ancestor` filter
    syntax.

    Exercised here against a REAL running container (a tiny `busybox`
    image re-tagged to look like a versioned LibreLane image) - a real
    Docker integration test, not just a string-matching unit test."""

    import subprocess as sp

    from app.domain.physical_design import librelane_runner

    if shutil.which("docker") is None:
        pytest.skip("docker CLI is not available in this environment")

    fake_repo = "test-fake-librelane-repo"
    tagged_image = f"{fake_repo}:9.9.9"
    sp.run(["docker", "tag", "busybox:latest", tagged_image], check=True, capture_output=True)

    with tempfile.TemporaryDirectory() as tmp:
        container_name = "test-cancel-container-" + Path(tmp).name
        run_result = sp.run(
            ["docker", "run", "-d", "--rm", "--name", container_name, "-w", tmp, tagged_image, "sleep", "60"],
            capture_output=True,
            text=True,
        )
        assert run_result.returncode == 0, run_result.stderr

        try:
            original_image = librelane_runner._LIBRELANE_DOCKER_IMAGE
            librelane_runner._LIBRELANE_DOCKER_IMAGE = fake_repo
            try:
                librelane_runner._kill_container_for_workdir(Path(tmp))
            finally:
                librelane_runner._LIBRELANE_DOCKER_IMAGE = original_image

            deadline = time.monotonic() + 5
            still_running = True
            while time.monotonic() < deadline:
                check = sp.run(["docker", "ps", "-q", "--filter", f"name={container_name}"], capture_output=True, text=True)
                if not check.stdout.strip():
                    still_running = False
                    break
                time.sleep(0.2)
            assert not still_running, "the real container was never actually killed"
        finally:
            sp.run(["docker", "kill", container_name], capture_output=True)  # best-effort cleanup
