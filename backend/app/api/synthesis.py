"""HTTP API for Step 18's real HDL -> Yosys synthesis pipeline.

Pure transport/orchestration - contains zero HDL-generation/Yosys-
invocation logic. The ONE real implementation remains
app.domain.synthesis.pipeline.run_synthesis(); this module never
re-validates the Canonical IR, never re-implements guardrails, and never
fabricates synthesis results.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.domain.synthesis.models import SynthesisResult
from app.services.synthesis_service import run_synthesis_for_document

router = APIRouter(prefix="/api/synthesis", tags=["synthesis"])


class SynthesisRequest(BaseModel):
    """The wire format for POST /api/synthesis/generate.

    `document` is intentionally a loose JSON object here - real Canonical
    IR validation (schema, guardrails) happens entirely inside the
    synthesis pipeline, never duplicated at this layer.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]


@router.post(
    "/generate",
    response_model=SynthesisResult,
    summary="Generate real Verilog HDL from a Canonical IR document and synthesize it with the real Yosys toolchain.",
    description=(
        "Accepts a Canonical IR document built entirely from primitive "
        "kinds (input/output/AND/OR/NOT) and runs it through a real HDL "
        "generator, then the actual Yosys executable (generic synthesis "
        "only - no target cell-library mapping yet, that belongs to a "
        "future step). Returns is_valid=false with structured errors for "
        "unsupported component kinds, IR validation failures, or any "
        "real Yosys failure (including yosys not being installed) - "
        "never a fabricated/best-effort synthesis result. A successful "
        "response includes the real generated + synthesized Verilog, the "
        "real Yosys JSON netlist and stat report, and an honest "
        "id_mapping back to canonical IR component ids (never a second, "
        "competing identity system)."
    ),
)
def post_generate_synthesis(request: SynthesisRequest) -> SynthesisResult:
    return run_synthesis_for_document(request.document)
