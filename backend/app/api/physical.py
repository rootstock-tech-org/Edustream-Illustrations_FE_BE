"""HTTP API for the physical layout generation service (Step 8).

Pure transport/orchestration - contains zero layout-generation logic.
The ONE real implementation remains
app.domain.physical.generator.generate_physical_layout(); this module
never re-validates the Canonical IR, never re-implements guardrails, and
never invents new physical-layout semantics.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.domain.physical.models import PhysicalResult
from app.services.physical_service import run_physical_generation

router = APIRouter(prefix="/api/physical", tags=["physical"])


class PhysicalGenerationRequest(BaseModel):
    """The wire format for POST /api/physical/generate.

    `document` is intentionally a loose JSON object here - real Canonical
    IR validation (schema, guardrails) happens entirely inside the
    physical pipeline, never duplicated at this layer. A `document` that
    is well-formed JSON but not a valid Canonical IR still produces a
    normal HTTP 200 response with a structured
    `PhysicalResult(is_valid=false)` - only a fundamentally malformed
    request body produces the standard FastAPI 422 validation response.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]


@router.post(
    "/generate",
    response_model=PhysicalResult,
    summary="Generate a deterministic physical floorplan from a Canonical IR document.",
    description=(
        "Accepts a Canonical IR document and returns the exact same "
        "PhysicalResult shape the domain generator produces "
        "(is_valid/errors/warnings/physical) - no second, frontend-specific "
        "result format. The IR is validated/normalized via the existing "
        "guardrails pipeline before generation; an invalid IR produces a "
        "structured error, never a partial layout. Block sizing/placement is "
        "illustrative/synthetic - not derived from any real process/technology "
        "(PDK) library, and nets carry no real routed geometry."
    ),
)
def post_generate_physical(request: PhysicalGenerationRequest) -> PhysicalResult:
    return run_physical_generation(request.document)
