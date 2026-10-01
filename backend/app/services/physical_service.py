"""Thin application service for Step 8: orchestrates request-level IR
parsing and delegates ALL real work to the ONE existing physical layout
generator, app.domain.physical.generator.generate_physical_layout(). This
module intentionally contains zero physical-layout logic."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.domain.ir.serialization import from_dict
from app.domain.physical.errors import PhysicalError
from app.domain.physical.generator import generate_physical_layout
from app.domain.physical.models import PhysicalResult


def run_physical_generation(document_data: dict[str, Any]) -> PhysicalResult:
    """Parse a raw IR document payload and run the existing physical
    layout generator.

    A `document` that is well-formed JSON but not a valid Canonical IR
    document produces a structured `INVALID_IR_DOCUMENT` PhysicalResult -
    never an unhandled exception. This is the ONLY IR-parsing step;
    guardrail validation and physical layout generation remain
    exclusively inside `generate_physical_layout()` - never duplicated
    here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return PhysicalResult(
            is_valid=False,
            errors=[PhysicalError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    return generate_physical_layout(document)
