"""Structured errors for the physical/silicon domain - mirrors
GuardrailIssue/SchematicError/SimulationError in spirit (code/message/
path)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PhysicalError(BaseModel):
    """A single problem preventing (or affecting) physical layout generation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str
