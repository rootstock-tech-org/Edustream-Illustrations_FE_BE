"""Thin application service for Step 15: delegates ALL real work to the ONE
existing prompt resolution implementation,
app.domain.prompt.resolver.resolve_prompt(). This module intentionally
contains zero intent-understanding logic of its own."""

from __future__ import annotations

from app.domain.prompt.models import PromptResolution
from app.domain.prompt.resolver import resolve_prompt


def run_prompt_resolution(prompt: str) -> PromptResolution:
    return resolve_prompt(prompt)
