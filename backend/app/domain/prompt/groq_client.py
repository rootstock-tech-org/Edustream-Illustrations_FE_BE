"""Thin wrapper around the official Groq Python SDK - the ONLY module in
this codebase that talks to Groq. Every SDK-level exception is converted
into one of this module's own typed exceptions so callers (resolver.py)
never need to know anything about Groq SDK internals, and so a future
swap to a different LLM provider only ever touches this one file.

Never returns a fabricated/guessed circuit - a failure here always raises
instead of returning a partial/best-effort result.
"""

from __future__ import annotations

import json
from typing import Any

from groq import APIConnectionError, APIStatusError, APITimeoutError, Groq

from app.core.config import get_settings


class GroqConfigError(Exception):
    """Raised when GROQ_API_KEY is not configured."""


class GroqTimeoutError(Exception):
    """Raised when the Groq API call exceeds the configured timeout."""


class GroqProviderError(Exception):
    """Raised for any other Groq API failure (non-2xx, connection error,
    malformed/non-JSON response content, etc.)."""


_SYSTEM_PROMPT = """You are a VLSI circuit intent extractor. Given a user's natural-language request describing a digital circuit, respond with ONLY a JSON object (no prose, no markdown code fences) matching exactly this shape:

{
  "circuit_name": "string - a short human-readable name for the circuit",
  "components": [
    {
      "id": "string - a unique short identifier, e.g. \\"in_a\\"",
      "kind": "string - e.g. \\"input\\", \\"output\\", \\"AND\\", \\"OR\\", \\"NOT\\", \\"DFF\\" (a real 1-bit D flip-flop/register: has exactly d/clk/q ports, use this for \\"D flip-flop\\", \\"register\\", \\"store on clock edge\\" requests), or a descriptive kind like \\"adder\\", \\"mux\\", \\"counter\\", \\"alu\\" for higher-level functional blocks",
      "name": "string - a human-readable display name",
      "width": "integer, optional, default 1 - bit width for simple signals",
      "ports": "optional list of {\\"name\\": string, \\"direction\\": \\"input\\"|\\"output\\", \\"width\\": integer} - REQUIRED for any kind that is not one of input/output/AND/OR/NOT/DFF, since those need an explicit, complete list of every real signal the block has"
    }
  ],
  "connections": [
    {
      "source_id": "string - id of the driving component",
      "source_port": "string, optional - the driving component's output port name (omit only if it has exactly one output)",
      "target_id": "string - id of the driven component",
      "target_port": "string, optional - the driven component's input port name (omit only if it has exactly one input)"
    }
  ]
}

Always include explicit "ports" for any non-primitive kind (adder/mux/counter/alu/etc.) - never omit them. Respond with the JSON object only."""


def request_vlsi_intent(prompt: str) -> dict[str, Any]:
    """Call the real Groq API and return the raw (still untrusted) parsed
    JSON object. Never fabricates a circuit on failure - raises a typed
    exception instead, always."""

    settings = get_settings()
    if not settings.groq_api_key:
        raise GroqConfigError("GROQ_API_KEY is not configured.")

    client = Groq(api_key=settings.groq_api_key, timeout=settings.groq_timeout_seconds)

    try:
        response = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
    except APITimeoutError as exc:
        raise GroqTimeoutError(f"Groq API call timed out: {exc}") from exc
    except (APIConnectionError, APIStatusError) as exc:
        raise GroqProviderError(f"Groq API call failed: {exc}") from exc
    except Exception as exc:  # noqa: BLE001 - defensive: never let an unexpected SDK error escape uncaught
        raise GroqProviderError(f"Unexpected error calling Groq API: {exc}") from exc

    raw_content = response.choices[0].message.content if response.choices else None
    if not raw_content:
        raise GroqProviderError("Groq API returned an empty response.")

    try:
        parsed = json.loads(raw_content)
    except (json.JSONDecodeError, TypeError) as exc:
        raise GroqProviderError(f"Groq response was not valid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise GroqProviderError("Groq response JSON was not a JSON object.")

    return parsed
