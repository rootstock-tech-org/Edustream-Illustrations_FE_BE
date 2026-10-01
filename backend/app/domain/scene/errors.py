"""Structured errors for the scene domain - mirrors GuardrailIssue/
SchematicError/PhysicalError/SimulationError in spirit (code/message/
path)."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SceneError(BaseModel):
    """A single problem preventing (or affecting) scene generation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str
