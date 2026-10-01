"""Structured errors for behavioral simulation - mirrors GuardrailIssue/
SchematicError in spirit (code/message/path)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SimulationError(BaseModel):
    """A single problem preventing (or affecting) simulation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str
