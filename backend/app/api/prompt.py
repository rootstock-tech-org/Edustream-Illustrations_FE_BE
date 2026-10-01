"""HTTP API for prompt-to-circuit resolution (Step 16: production
Groq-backed AI implementation, same endpoint/contract as Step 15).

Pure transport/orchestration - contains zero AI/intent-understanding
logic. The ONE real implementation remains
app.domain.prompt.resolver.resolve_prompt(); this module never
re-implements Groq calls, intent compilation, or circuit semantics.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from app.domain.prompt.models import PromptResolution
from app.services.prompt_service import run_prompt_resolution

router = APIRouter(prefix="/api/prompt", tags=["prompt"])


class PromptResolveRequest(BaseModel):
    """The wire format for POST /api/prompt/resolve."""

    model_config = ConfigDict(extra="forbid")

    prompt: str


@router.post(
    "/resolve",
    response_model=PromptResolution,
    summary="Resolve a natural-language prompt to a known Canonical IR example circuit.",
    description=(
        "Uses a real Groq LLM to extract structured VLSI intent, then a "
        "fully deterministic compiler builds the Canonical IR - the LLM is "
        "never allowed to produce IR directly, and the existing guardrails "
        "remain the final authority. Returns is_recognized=false with a "
        "typed failure_reason (missing_api_key/provider_timeout/"
        "provider_error/malformed_intent/unsupported_component_kind/"
        "invalid_connection/guardrails_rejected) and document=null for any "
        "failure - never a fabricated/best-effort circuit. Always HTTP 200 "
        "for both recognized and unrecognized prompts - this is a "
        "business-level outcome, not a request error."
    ),
)
def post_resolve_prompt(request: PromptResolveRequest) -> PromptResolution:
    return run_prompt_resolution(request.prompt)
