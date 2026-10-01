"""Structured errors for HDL generation - mirrors SchematicError/GuardrailIssue
in spirit (code/message/path), scoped to this domain."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class HdlError(BaseModel):
    """A single problem preventing HDL generation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str
