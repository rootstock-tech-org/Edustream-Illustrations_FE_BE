"""run_synthesis(document) -> SynthesisResult - the single public entry
point for Step 18's real HDL -> Yosys synthesis pipeline.

Canonical IR -> app.domain.hdl.generator (real, attributed Verilog) ->
REAL Yosys (app.domain.synthesis.yosys_runner) ->
app.domain.synthesis.mapping (honest identity reconstruction). The
generated Verilog and the resulting synthesized artifacts are always
additional, DERIVED views of the canonical IR - the IR itself remains
authoritative regardless of what Yosys's optimizer does to the netlist.
Never a fabricated/mocked synthesis result at any stage.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.domain.hdl.generator import generate_verilog
from app.domain.ir.models import IRDocument
from app.domain.synthesis.mapping import build_id_mapping
from app.domain.synthesis.models import (
    SynthesisArtifacts,
    SynthesisError,
    SynthesisResult,
)
from app.domain.synthesis.yosys_runner import run_yosys


def run_synthesis(document: IRDocument) -> SynthesisResult:
    hdl_result = generate_verilog(document)
    if not hdl_result.success or hdl_result.module is None:
        if hdl_result.errors:
            errors = [
                SynthesisError(code=error.code, message=error.message, path=error.path)
                for error in hdl_result.errors
            ]
        else:
            errors = [
                SynthesisError(
                    code=hdl_result.failure_reason or "HDL_GENERATION_FAILED",
                    message=hdl_result.message,
                    path="document",
                )
            ]
        return SynthesisResult(is_valid=False, errors=errors)

    module = hdl_result.module
    settings = get_settings()

    run_outcome = run_yosys(
        module.verilog,
        module.module_name,
        yosys_path=settings.yosys_path,
        timeout_seconds=settings.yosys_timeout_seconds,
    )
    if not run_outcome.success:
        return SynthesisResult(
            is_valid=False,
            errors=[
                SynthesisError(
                    code=run_outcome.failure_reason or "YOSYS_SYNTHESIS_FAILED",
                    message=run_outcome.message,
                    path="yosys",
                )
            ],
        )

    assert run_outcome.netlist_json is not None  # guaranteed by success=True

    id_mapping = build_id_mapping(
        run_outcome.netlist_json,
        module.module_name,
        module.top_level_ports,
        module.gate_instance_ids,
    )

    warnings: list[SynthesisError] = []
    if id_mapping.unmapped_cell_names:
        warnings.append(
            SynthesisError(
                code="UNMAPPED_SYNTHESIZED_CELLS",
                message=(
                    f"{len(id_mapping.unmapped_cell_names)} synthesized cell(s) "
                    "could not be traced back to a canonical component: "
                    f"{id_mapping.unmapped_cell_names}"
                ),
                path="netlist",
            )
        )

    artifacts = SynthesisArtifacts(
        generated_verilog=module.verilog,
        synthesized_verilog=run_outcome.synthesized_verilog or "",
        netlist_json_text=run_outcome.netlist_json_text or "",
        stat_report=run_outcome.stat_report or "",
    )

    return SynthesisResult(
        is_valid=True, warnings=warnings, artifacts=artifacts, id_mapping=id_mapping
    )
