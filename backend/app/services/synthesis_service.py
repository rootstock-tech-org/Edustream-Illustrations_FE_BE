"""Thin application service for Step 18: orchestrates request-level IR
parsing and delegates ALL real work to the ONE existing synthesis
pipeline, app.domain.synthesis.pipeline.run_synthesis(). This module
intentionally contains zero HDL-generation/Yosys-invocation logic."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.domain.ir.serialization import from_dict
from app.domain.synthesis.models import SynthesisError, SynthesisResult
from app.domain.synthesis.pipeline import run_synthesis


def run_synthesis_for_document(document_data: dict[str, Any]) -> SynthesisResult:
    """Parse a raw IR document payload and run the existing synthesis
    pipeline.

    A `document` that is well-formed JSON but not a valid Canonical IR
    document produces a structured `INVALID_IR_DOCUMENT` SynthesisResult -
    never an unhandled exception. This is the ONLY IR-parsing step;
    guardrail validation, HDL generation, and Yosys invocation remain
    exclusively inside `run_synthesis()` - never duplicated here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return SynthesisResult(
            is_valid=False,
            errors=[SynthesisError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    return run_synthesis(document)
