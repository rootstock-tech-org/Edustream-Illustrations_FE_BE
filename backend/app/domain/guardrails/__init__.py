"""Guardrails layer: sits between Canonical IR construction/validation and
any future downstream consumer. Never invents a new IR format - always
operates on/returns app.domain.ir.models.IRDocument."""

from app.domain.guardrails.models import GuardrailIssue, GuardrailResult, GuardrailSeverity
from app.domain.guardrails.normalization import normalize_document
from app.domain.guardrails.validator import run_guardrails

__all__ = [
    "GuardrailIssue",
    "GuardrailResult",
    "GuardrailSeverity",
    "normalize_document",
    "run_guardrails",
]
