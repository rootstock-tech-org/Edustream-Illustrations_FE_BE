"""HTTP API for the schematic generation service (Step 8).

Pure transport/orchestration - contains zero layout-generation logic.
The ONE real implementation remains
app.domain.schematic.generator.generate_schematic(); this module never
re-validates the Canonical IR, never re-implements guardrails, and never
invents new circuit/layout semantics.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.domain.schematic.models import SchematicResult
from app.services.schematic_service import run_schematic_generation

router = APIRouter(prefix="/api/schematic", tags=["schematic"])


class SchematicGenerationRequest(BaseModel):
    """The wire format for POST /api/schematic/generate.

    `document` is intentionally a loose JSON object here - real Canonical
    IR validation (schema, guardrails) happens entirely inside the
    schematic pipeline, never duplicated at this layer. A `document` that
    is well-formed JSON but not a valid Canonical IR still produces a
    normal HTTP 200 response with a structured
    `SchematicResult(is_valid=false)` - only a fundamentally malformed
    request body produces the standard FastAPI 422 validation response.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]


@router.post(
    "/generate",
    response_model=SchematicResult,
    summary="Generate a deterministic schematic from a Canonical IR document.",
    description=(
        "Accepts a Canonical IR document and returns the exact same "
        "SchematicResult shape the domain generator produces "
        "(is_valid/errors/warnings/schematic) - no second, frontend-specific "
        "result format. The IR is validated/normalized via the existing "
        "guardrails pipeline before generation; an invalid or unsupported IR "
        "produces a structured error, never a partial schematic."
    ),
)
def post_generate_schematic(request: SchematicGenerationRequest) -> SchematicResult:
    return run_schematic_generation(request.document)
