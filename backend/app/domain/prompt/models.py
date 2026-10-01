"""Prompt resolution contract - the seam between a raw user prompt and a
Canonical IR document.

Step 16 production note: this contract's PUBLIC SHAPE
(resolve_prompt(str) -> PromptResolution) is unchanged since Step 15 -
only the internals of resolver.py changed (deterministic alias matching
-> real Groq LLM + deterministic compiler). This is exactly what makes
the seam useful: a future different AI provider only ever needs to
change resolver.py/groq_client.py, never any downstream caller.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict

from app.domain.ir.models import IRDocument


class PromptFailureReason(str, Enum):
    """Typed, machine-readable reason for an is_recognized=False result -
    lets callers (the API layer, the frontend) distinguish an AI/infra
    problem from a content-level problem, without parsing message text."""

    MISSING_API_KEY = "missing_api_key"
    PROVIDER_TIMEOUT = "provider_timeout"
    PROVIDER_ERROR = "provider_error"
    MALFORMED_INTENT = "malformed_intent"
    UNSUPPORTED_COMPONENT_KIND = "unsupported_component_kind"
    INVALID_CONNECTION = "invalid_connection"
    GUARDRAILS_REJECTED = "guardrails_rejected"


class PromptResolution(BaseModel):
    """The deterministic outcome of resolve_prompt(). No fabricated/guessed
    circuit is ever returned - is_recognized=False always means document is
    None, never a partial/best-effort guess. failure_reason is always set
    when is_recognized is False, and always None when it is True."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_recognized: bool
    circuit_key: str | None = None
    message: str
    document: IRDocument | None = None
    failure_reason: PromptFailureReason | None = None
