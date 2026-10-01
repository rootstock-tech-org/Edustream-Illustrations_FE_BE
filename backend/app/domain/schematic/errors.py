"""Structured errors for schematic generation - mirrors GuardrailIssue in
spirit (code/message/path), scoped to this domain."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class SchematicError(BaseModel):
    """A single problem preventing (or affecting) schematic generation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str
