from unittest.mock import patch

from app.domain.prompt.groq_client import (
    GroqConfigError,
    GroqProviderError,
    GroqTimeoutError,
)
from app.domain.prompt.models import PromptFailureReason
from app.domain.prompt.resolver import resolve_prompt

_VALID_AND_GATE_RAW_INTENT = {
    "circuit_name": "AND Gate",
    "components": [
        {"id": "in_a", "kind": "input", "name": "A"},
        {"id": "in_b", "kind": "input", "name": "B"},
        {"id": "and1", "kind": "AND", "name": "AND1"},
        {"id": "out_y", "kind": "output", "name": "Y"},
    ],
    "connections": [
        {"source_id": "in_a", "target_id": "and1", "target_port": "a"},
        {"source_id": "in_b", "target_id": "and1", "target_port": "b"},
        {"source_id": "and1", "target_id": "out_y"},
    ],
}


def _patched(raw_intent=None, side_effect=None):
    return patch(
        "app.domain.prompt.resolver.request_vlsi_intent",
        return_value=raw_intent,
        side_effect=side_effect,
    )


def test_successful_generation_returns_valid_ir() -> None:
    with _patched(raw_intent=_VALID_AND_GATE_RAW_INTENT):
        result = resolve_prompt("Design an AND gate")

    assert result.is_recognized is True
    assert result.failure_reason is None
    assert result.document is not None
    assert result.document.name == "AND Gate"
    assert len(result.document.components) == 4


def test_missing_api_key_returns_typed_failure() -> None:
    with _patched(side_effect=GroqConfigError("no key")):
        result = resolve_prompt("Design an AND gate")

    assert result.is_recognized is False
    assert result.document is None
    assert result.failure_reason == PromptFailureReason.MISSING_API_KEY


def test_provider_timeout_returns_typed_failure() -> None:
    with _patched(side_effect=GroqTimeoutError("timed out")):
        result = resolve_prompt("Design an AND gate")

    assert result.is_recognized is False
    assert result.failure_reason == PromptFailureReason.PROVIDER_TIMEOUT


def test_provider_error_returns_typed_failure() -> None:
    with _patched(side_effect=GroqProviderError("500 from groq")):
        result = resolve_prompt("Design an AND gate")

    assert result.is_recognized is False
    assert result.failure_reason == PromptFailureReason.PROVIDER_ERROR


def test_malformed_intent_json_returns_typed_failure() -> None:
    # Missing required "circuit_name" field entirely.
    with _patched(raw_intent={"components": [], "connections": []}):
        result = resolve_prompt("Design something")

    assert result.is_recognized is False
    assert result.document is None
    assert result.failure_reason == PromptFailureReason.MALFORMED_INTENT


def test_unsupported_component_kind_returns_typed_failure() -> None:
    raw_intent = {
        "circuit_name": "Mystery Circuit",
        "components": [{"id": "x", "kind": "quantum_flux_gate", "name": "X"}],
        "connections": [],
    }
    with _patched(raw_intent=raw_intent):
        result = resolve_prompt("Design a quantum flux gate")

    assert result.is_recognized is False
    assert result.document is None
    assert result.failure_reason == PromptFailureReason.UNSUPPORTED_COMPONENT_KIND


def test_invalid_connection_returns_typed_failure() -> None:
    raw_intent = {
        "circuit_name": "Broken",
        "components": [{"id": "in_a", "kind": "input", "name": "A"}],
        "connections": [{"source_id": "in_a", "target_id": "does_not_exist"}],
    }
    with _patched(raw_intent=raw_intent):
        result = resolve_prompt("Design something broken")

    assert result.is_recognized is False
    assert result.failure_reason == PromptFailureReason.INVALID_CONNECTION


def test_guardrails_rejection_returns_typed_failure() -> None:
    # and1.a is driven by BOTH in_a and in_b - a real MULTIPLE_DRIVERS_CONFLICT
    # that the compiler itself doesn't check for (structurally valid
    # connections) but the existing guardrails correctly catch.
    raw_intent = {
        "circuit_name": "Conflicting Drivers",
        "components": [
            {"id": "in_a", "kind": "input", "name": "A"},
            {"id": "in_b", "kind": "input", "name": "B"},
            {"id": "and1", "kind": "AND", "name": "AND1"},
        ],
        "connections": [
            {"source_id": "in_a", "target_id": "and1", "target_port": "a"},
            {"source_id": "in_b", "target_id": "and1", "target_port": "a"},
        ],
    }
    with _patched(raw_intent=raw_intent):
        result = resolve_prompt("Design a conflicting circuit")

    assert result.is_recognized is False
    assert result.document is None
    assert result.failure_reason == PromptFailureReason.GUARDRAILS_REJECTED


def test_no_silent_fallback_to_deterministic_matcher_on_ai_failure() -> None:
    # Even though "AND gate" would resolve deterministically (Step 15's
    # preserved matcher), a Groq failure must be surfaced honestly, never
    # silently replaced by a deterministic guess.
    with _patched(side_effect=GroqProviderError("groq is down")):
        result = resolve_prompt("Show me an AND gate")

    assert result.is_recognized is False
    assert result.circuit_key is None
    assert result.failure_reason == PromptFailureReason.PROVIDER_ERROR
