"""Thin application service for Step 8: orchestrates request-level IR
parsing and delegates ALL real work to the ONE existing schematic
generator, app.domain.schematic.generator.generate_schematic(). This
module intentionally contains zero schematic-generation logic."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.domain.ir.serialization import from_dict
from app.domain.schematic.errors import SchematicError
from app.domain.schematic.generator import generate_schematic
from app.domain.schematic.models import SchematicResult


def run_schematic_generation(document_data: dict[str, Any]) -> SchematicResult:
    """Parse a raw IR document payload and run the existing schematic
    generator.

    A `document` that is well-formed JSON but not a valid Canonical IR
    document produces a structured `INVALID_IR_DOCUMENT` SchematicResult -
    never an unhandled exception. This is the ONLY IR-parsing step;
    guardrail validation and schematic generation remain exclusively
    inside `generate_schematic()` - never duplicated here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return SchematicResult(
            is_valid=False,
            errors=[SchematicError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    return generate_schematic(document)
