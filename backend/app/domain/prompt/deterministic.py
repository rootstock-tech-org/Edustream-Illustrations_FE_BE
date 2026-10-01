"""resolve_prompt_deterministically(prompt) -> PromptResolution - the
Step 15 keyword/alias matcher, PRESERVED verbatim (moved out of
resolver.py, which is now the Step 16 Groq-backed orchestrator).

This is intentionally NOT wired into the live resolve_prompt() seam
anymore - Step 16 requires that an AI failure is always surfaced
honestly, never silently replaced by a deterministic guess. This module
is kept, fully tested, and importable in case a future explicit
("try without AI") feature wants it - but nothing calls it automatically.
"""

from __future__ import annotations

import re

from app.domain.ir.examples import ALL_EXAMPLES
from app.domain.prompt.models import PromptResolution

# Longer/more specific phrases are listed first purely for readability -
# every alias below maps to a circuit that also has a shorter generic
# alias, so match order never actually changes the result for this table.
_ALIASES: dict[str, str] = {
    "and gate": "and_gate",
    "and": "and_gate",
    "2:1 mux": "mux_2to1",
    "2-to-1 multiplexer": "mux_2to1",
    "2 to 1 multiplexer": "mux_2to1",
    "multiplexer": "mux_2to1",
    "mux": "mux_2to1",
}

_NOT_RECOGNIZED_MESSAGE = (
    "Could not recognize a known circuit in this prompt. Try mentioning a "
    "supported circuit by name (e.g. \"AND gate\" or \"2:1 mux\")."
)


def _normalize(prompt: str) -> str:
    return re.sub(r"\s+", " ", prompt.strip().lower())


def _match_alias(normalized_prompt: str) -> str | None:
    """Word-boundary matching (not raw substring) so a short generic alias
    like "and" never false-positives inside an unrelated word - e.g. a
    hypothetical future "NAND" example must never be misread as "AND"."""

    for alias, circuit_key in _ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", normalized_prompt):
            return circuit_key
    return None


def resolve_prompt_deterministically(prompt: str) -> PromptResolution:
    """Deterministically match a raw prompt against the known alias table
    and return the resolved example IRDocument, or an honest
    is_recognized=False result - never a guessed/fabricated circuit."""

    circuit_key = _match_alias(_normalize(prompt))

    if circuit_key is None:
        return PromptResolution(is_recognized=False, message=_NOT_RECOGNIZED_MESSAGE)

    document = ALL_EXAMPLES[circuit_key]()
    return PromptResolution(
        is_recognized=True,
        circuit_key=circuit_key,
        message=f"Recognized as the '{circuit_key}' example circuit.",
        document=document,
    )
