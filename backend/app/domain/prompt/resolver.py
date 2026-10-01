"""resolve_prompt(prompt) -> PromptResolution - the single public entry
point for prompt-to-circuit resolution (Step 16: production AI-backed
implementation, replacing Step 15's deterministic keyword matcher).

ARCHITECTURAL SEAM (preserved from Step 15): this function's signature
(str -> PromptResolution) is the one contract every caller
(app/services/prompt_service.py, and therefore app/api/prompt.py) relies
on. Step 15 implemented it with a deterministic alias table; Step 16
implements it with a real Groq LLM call - callers never changed. A
future different AI provider would only ever need to change this module
(and groq_client.py), never anything downstream.

Pipeline: Groq LLM -> VLSIIntent (untrusted, validated) -> deterministic
compiler -> existing guardrails (the final authority, unchanged) ->
IRDocument. The LLM is NEVER asked to produce IR directly, and its raw
output is NEVER used without passing through every one of these gates.

NO SILENT FALLBACK: app.domain.prompt.deterministic.resolve_prompt_deterministically
(the preserved Step 15 logic) is intentionally NEVER called from here -
an AI/provider failure must always be surfaced honestly as such, never
quietly replaced by a deterministic guess.
"""

from __future__ import annotations

from pydantic import ValidationError

from app.domain.guardrails.validator import run_guardrails
from app.domain.prompt.compiler import compile_intent
from app.domain.prompt.groq_client import (
    GroqConfigError,
    GroqProviderError,
    GroqTimeoutError,
    request_vlsi_intent,
)
from app.domain.prompt.intent import VLSIIntent
from app.domain.prompt.models import PromptFailureReason, PromptResolution


def resolve_prompt(prompt: str) -> PromptResolution:
    try:
        raw_intent = request_vlsi_intent(prompt)
    except GroqConfigError as exc:
        return PromptResolution(
            is_recognized=False,
            message=f"The AI provider is not configured: {exc}",
            failure_reason=PromptFailureReason.MISSING_API_KEY,
        )
    except GroqTimeoutError as exc:
        return PromptResolution(
            is_recognized=False,
            message=f"The AI provider timed out. Please try again. ({exc})",
            failure_reason=PromptFailureReason.PROVIDER_TIMEOUT,
        )
    except GroqProviderError as exc:
        return PromptResolution(
            is_recognized=False,
            message=f"The AI provider returned an error: {exc}",
            failure_reason=PromptFailureReason.PROVIDER_ERROR,
        )

    try:
        intent = VLSIIntent.model_validate(raw_intent)
    except ValidationError:
        return PromptResolution(
            is_recognized=False,
            message="The AI did not return a well-formed circuit description.",
            failure_reason=PromptFailureReason.MALFORMED_INTENT,
        )

    compile_outcome = compile_intent(intent)
    if not compile_outcome.success:
        return PromptResolution(
            is_recognized=False,
            message=compile_outcome.message,
            failure_reason=compile_outcome.failure_reason,
        )

    assert compile_outcome.document is not None  # guaranteed by success=True

    guardrail_result = run_guardrails(compile_outcome.document)
    if not guardrail_result.is_valid:
        issues = "; ".join(f"{issue.code}: {issue.message}" for issue in guardrail_result.errors)
        return PromptResolution(
            is_recognized=False,
            message=f"The generated circuit failed validation: {issues}",
            failure_reason=PromptFailureReason.GUARDRAILS_REJECTED,
        )

    return PromptResolution(
        is_recognized=True,
        message=f"Generated '{intent.circuit_name}' from your prompt.",
        document=compile_outcome.document,
    )
