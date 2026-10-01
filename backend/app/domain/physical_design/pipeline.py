"""run_physical_design(document, *, librelane_binary, timeout_seconds,
work_dir) -> PhysicalDesignResult - the single orchestrator for Step 19.

Canonical IR -> app.domain.hdl.generator.generate_verilog() (the EXISTING,
unmodified Step 18 generator - never duplicated/regenerated here) -> real
LibreLane (app.domain.physical_design.librelane_runner) -> real DEF/GDS/
netlist/metrics -> app.domain.physical_design.mapping (honest identity
reconstruction). Deliberately independent of
app.domain.synthesis.pipeline.run_synthesis() - that is Step 18's own
GENERIC-synthesis verification path and is never called as a substitute
for a real SKY130 physical-design flow.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from app.domain.hdl.generator import generate_verilog
from app.domain.ir.models import IRDocument
from app.domain.physical_design.librelane_runner import run_librelane, write_librelane_config
from app.domain.physical_design.mapping import build_identity_mapping, parse_die_area_um
from app.domain.physical_design.models import (
    ArtifactMetadata,
    FailureCode,
    PhysicalDesignError,
    PhysicalDesignResult,
    SignoffStatus,
)


def run_physical_design(
    document: IRDocument,
    *,
    librelane_binary: str,
    timeout_seconds: float,
    work_dir: Path,
    cancel_event: "threading.Event | None" = None,
) -> PhysicalDesignResult:
    hdl_result = generate_verilog(document)
    if not hdl_result.success or hdl_result.module is None:
        code = hdl_result.failure_reason or "HDL_GENERATION_FAILED"
        return PhysicalDesignResult(
            is_valid=False,
            errors=[PhysicalDesignError(code=code, message=hdl_result.message, path="document")],
        )

    module = hdl_result.module
    config_path = write_librelane_config(work_dir, module, component_count=len(document.components))

    run_outcome = run_librelane(
        librelane_binary, config_path, timeout_seconds=timeout_seconds, cancel_event=cancel_event
    )
    if not run_outcome.success:
        return PhysicalDesignResult(
            is_valid=False,
            errors=[
                PhysicalDesignError(
                    code=run_outcome.failure_reason or FailureCode.UNKNOWN_FLOW_FAILURE.value,
                    message=run_outcome.message,
                    path="librelane",
                )
            ],
        )

    assert run_outcome.run_dir is not None  # guaranteed by success=True
    final_dir = run_outcome.run_dir / "final"

    def_path = _find_one(final_dir / "def", "*.def")
    if def_path is None:
        return PhysicalDesignResult(
            is_valid=False,
            errors=[
                PhysicalDesignError(
                    code=FailureCode.GDS_EXPORT_FAILED.value,
                    message="LibreLane reported success but no final DEF was found.",
                    path="librelane.final.def",
                )
            ],
        )

    def_text = def_path.read_text()
    identity_mapping = build_identity_mapping(def_text, module)
    die_area = parse_die_area_um(def_text)

    metrics = _load_metrics(final_dir / "metrics.json")
    signoff = _build_signoff(metrics)
    artifacts = _collect_artifacts(final_dir)

    return PhysicalDesignResult(
        is_valid=True,
        signoff=signoff,
        identity_mapping=identity_mapping,
        artifacts=artifacts,
        metrics=metrics,
        die_width_um=die_area[0] if die_area else None,
        die_height_um=die_area[1] if die_area else None,
    )


def _find_one(directory: Path, pattern: str) -> Path | None:
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(pattern))
    return matches[0] if matches else None


def _load_metrics(metrics_path: Path) -> dict:
    if not metrics_path.is_file():
        return {}
    try:
        raw_metrics = json.loads(metrics_path.read_text())
    except json.JSONDecodeError:
        return {}
    return _sanitize_metrics(raw_metrics)


def _sanitize_metrics(raw_metrics: dict) -> dict:
    """Real OpenROAD/LibreLane metrics can legitimately be +-Infinity/NaN
    (e.g. a register-to-register timing slack metric for a design with no
    clock/registers at all, like every primitive-only circuit here, has
    no such path - OpenROAD honestly reports that as Infinity). JSON has
    no representation for non-finite floats, so these are converted to
    `None` here - never silently dropped, never fabricated as 0."""

    sanitized: dict = {}
    for key, value in raw_metrics.items():
        if isinstance(value, float) and (value in (float("inf"), float("-inf")) or value != value):
            sanitized[key] = None
        else:
            sanitized[key] = value
    return sanitized


def _build_signoff(metrics: dict) -> SignoffStatus | None:
    if not metrics:
        return None

    def _count(*keys: str) -> int | None:
        values = [metrics[key] for key in keys if key in metrics]
        if not values:
            return None
        return int(sum(values))

    drc_count = _count("route__drc_errors", "magic__drc_error__count", "klayout__drc_error__count")
    lvs_count = _count(
        "design__lvs_error__count",
        "design__lvs_device_difference__count",
        "design__lvs_net_difference__count",
        "design__lvs_unmatched_device__count",
        "design__lvs_unmatched_net__count",
        "design__lvs_unmatched_pin__count",
    )
    antenna_count = _count("antenna__violating__nets", "route__antenna_violation__count")

    return SignoffStatus(
        drc_passed=(drc_count == 0) if drc_count is not None else None,
        lvs_passed=(lvs_count == 0) if lvs_count is not None else None,
        antenna_passed=(antenna_count == 0) if antenna_count is not None else None,
        drc_error_count=drc_count,
        lvs_error_count=lvs_count,
    )


_ARTIFACT_KINDS = {
    "def": "def/*.def",
    "gds": "gds/*.gds",
    "netlist": "nl/*.nl.v",
    "metrics_json": "metrics.json",
}


def _collect_artifacts(final_dir: Path) -> list[ArtifactMetadata]:
    artifacts: list[ArtifactMetadata] = []
    for artifact_type, pattern in _ARTIFACT_KINDS.items():
        for path in sorted(final_dir.glob(pattern)):
            if path.is_file():
                artifacts.append(
                    ArtifactMetadata(
                        artifact_type=artifact_type,
                        file_name=str(path.relative_to(final_dir)),
                        size_bytes=path.stat().st_size,
                    )
                )
    return artifacts
