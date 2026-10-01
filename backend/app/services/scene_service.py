"""Thin application service for Step 9: orchestrates request-level IR
parsing and delegates ALL real work to the ONE existing scene generator,
app.domain.scene.generator.generate_scene(). This module intentionally
contains zero scene/layout-generation logic."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.domain.ir.serialization import from_dict
from app.domain.scene.errors import SceneError
from app.domain.scene.generator import generate_scene
from app.domain.scene.models import SceneResult


def run_scene_generation(document_data: dict[str, Any]) -> SceneResult:
    """Parse a raw IR document payload and run the existing scene
    generator.

    A `document` that is well-formed JSON but not a valid Canonical IR
    document produces a structured `INVALID_IR_DOCUMENT` SceneResult -
    never an unhandled exception. This is the ONLY IR-parsing step;
    guardrail validation and scene generation remain exclusively inside
    `generate_scene()` - never duplicated here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return SceneResult(
            is_valid=False,
            errors=[SceneError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    return generate_scene(document)
