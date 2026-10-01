"""run_yosys(verilog_source, module_name, ...) -> YosysRunOutcome

Invokes the REAL Yosys executable via subprocess - never a mock, never a
fabricated synthesis result. Generic synthesis only (hierarchy/proc/opt)
- no target cell-library/PDK mapping (that belongs to a future step, per
the locked Step 18 -> Step 19 -> ... roadmap).
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class YosysRunOutcome:
    """The real outcome of one Yosys subprocess invocation. No partial/
    fabricated artifacts are ever returned when success is False."""

    success: bool
    synthesized_verilog: str | None = None
    netlist_json: dict | None = None
    netlist_json_text: str | None = None
    stat_report: str | None = None
    message: str = ""
    failure_reason: str | None = None


def run_yosys(
    verilog_source: str,
    module_name: str,
    *,
    yosys_path: str,
    timeout_seconds: float,
) -> YosysRunOutcome:
    """Write `verilog_source` to a scratch file, run REAL generic Yosys
    synthesis (hierarchy -check; proc; opt) against it, and return the
    real resulting JSON netlist, synthesized Verilog, and stat report.

    Attributes on generated cells are deliberately KEPT (`write_verilog`
    is never called with `-noattr`) since app.domain.synthesis.mapping
    relies on both cell/port NAMES and the `canonical_component_id`
    attribute for identity reconstruction.
    """

    with tempfile.TemporaryDirectory(prefix="vlsi_synth_") as tmp:
        tmp_path = Path(tmp)
        verilog_path = tmp_path / "design.v"
        json_path = tmp_path / "synth.json"
        synth_verilog_path = tmp_path / "synth.v"
        verilog_path.write_text(verilog_source)

        script = (
            f"read_verilog {verilog_path}; "
            f"hierarchy -check -top {module_name}; "
            "proc; opt; "
            f"write_json {json_path}; "
            f"write_verilog {synth_verilog_path}; "
            "stat"
        )

        try:
            result = subprocess.run(
                [yosys_path, "-p", script],
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
        except FileNotFoundError:
            return YosysRunOutcome(
                success=False,
                message=f"Yosys executable not found at '{yosys_path}'.",
                failure_reason="YOSYS_NOT_FOUND",
            )
        except subprocess.TimeoutExpired:
            return YosysRunOutcome(
                success=False,
                message=f"Yosys did not complete within {timeout_seconds} second(s).",
                failure_reason="YOSYS_TIMEOUT",
            )

        if result.returncode != 0:
            return YosysRunOutcome(
                success=False,
                message=(
                    f"Yosys synthesis failed (exit code {result.returncode}): "
                    f"{result.stderr.strip() or result.stdout.strip()}"
                ),
                failure_reason="YOSYS_SYNTHESIS_FAILED",
            )

        if not json_path.exists() or not synth_verilog_path.exists():
            return YosysRunOutcome(
                success=False,
                message="Yosys reported success but did not produce the expected output artifacts.",
                failure_reason="YOSYS_SYNTHESIS_FAILED",
            )

        netlist_json_text = json_path.read_text()
        try:
            netlist_json = json.loads(netlist_json_text)
        except json.JSONDecodeError:
            return YosysRunOutcome(
                success=False,
                message="Yosys produced a JSON netlist that could not be parsed.",
                failure_reason="YOSYS_SYNTHESIS_FAILED",
            )

        return YosysRunOutcome(
            success=True,
            synthesized_verilog=synth_verilog_path.read_text(),
            netlist_json=netlist_json,
            netlist_json_text=netlist_json_text,
            stat_report=result.stdout,
            message="Synthesis completed.",
        )
