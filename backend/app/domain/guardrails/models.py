"""Guardrail result models.

Sits between raw Canonical IR construction/validation (Step 2) and any
future downstream consumer (schematic compiler, simulation, physical
flow, 3D twin). Never a new IR format - `GuardrailResult.normalized_document`
is always a plain `app.domain.ir.models.IRDocument`.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.ir.models import IRDocument


class GuardrailSeverity(str, Enum):
    """How serious a GuardrailIssue is. ERROR blocks is_valid; WARNING does not."""

    ERROR = "error"
    WARNING = "warning"


class GuardrailIssue(BaseModel):
    """A single guardrail finding."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    severity: GuardrailSeverity
    message: str
    path: str


class GuardrailResult(BaseModel):
    """The deterministic outcome of running the guardrails pipeline on an
    IRDocument. `normalized_document` is only ever populated when there are
    zero errors - guardrails never hand back a normalized form of a
    document it considers unsafe."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[GuardrailIssue] = Field(default_factory=list)
    warnings: list[GuardrailIssue] = Field(default_factory=list)
    normalized_document: IRDocument | None = None
