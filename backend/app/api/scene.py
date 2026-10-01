"""HTTP API for the 3D-ready scene generation service (Step 9).

Pure transport/orchestration - contains zero scene-generation logic. The
ONE real implementation remains app.domain.scene.generator.generate_scene();
this module never re-validates the Canonical IR, never re-implements
guardrails, and never invents new circuit/layout/3D semantics.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.domain.scene.models import SceneResult
from app.services.scene_service import run_scene_generation

router = APIRouter(prefix="/api/scene", tags=["scene"])


class SceneGenerationRequest(BaseModel):
    """The wire format for POST /api/scene/generate.

    `document` is intentionally a loose JSON object here - real Canonical
    IR validation (schema, guardrails) happens entirely inside the scene
    pipeline, never duplicated at this layer. A `document` that is
    well-formed JSON but not a valid Canonical IR still produces a normal
    HTTP 200 response with a structured `SceneResult(is_valid=false)` -
    only a fundamentally malformed request body produces the standard
    FastAPI 422 validation response.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]


@router.post(
    "/generate",
    response_model=SceneResult,
    summary="Generate a minimal 3D-ready scene contract from a Canonical IR document.",
    description=(
        "Accepts a Canonical IR document and returns the exact same "
        "SceneResult shape the domain generator produces "
        "(is_valid/errors/warnings/scene) - no second, frontend-specific "
        "result format. The scene is a DATA CONTRACT for a future 3D digital "
        "twin, not a renderer: object positions/sizes are projected from the "
        "existing physical floorplan (Step 7) with a fixed, illustrative Z "
        "baseline and extrusion depth - never real PDK/process geometry. An "
        "invalid IR produces a structured error, never a partial scene."
    ),
)
def post_generate_scene(request: SceneGenerationRequest) -> SceneResult:
    return run_scene_generation(request.document)
