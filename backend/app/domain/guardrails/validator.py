"""The guardrails application-service entry point: run_guardrails().

Conceptually:

    Input IR -> Canonical IR validation -> Guardrails/normalization
             -> Validated canonical IR -> future downstream systems

This is an internal domain/application service - no HTTP API yet.
"""

from __future__ import annotations

from app.domain.guardrails.models import GuardrailIssue, GuardrailResult, GuardrailSeverity
from app.domain.guardrails.normalization import normalize_document
from app.domain.guardrails.rules import check_annotation_references, check_dff_port_shape, check_dff_reset_shape, check_empty_identifiers, check_floating_input_ports
from app.domain.ir.models import IRDocument
from app.domain.ir.validation import validate_document


def run_guardrails(document: IRDocument) -> GuardrailResult:
    """Validate the Canonical IR, apply only safe normalization, validate
    again, and return a deterministic structured result. Never raises.

    If the document already fails canonical validation, normalization is
    skipped entirely - normalizing (and thereby appearing to "process") an
    already-broken IR would contradict the "reject unsafe ambiguity rather
    than guessing" principle.
    """

    errors, warnings = _collect_issues(document)
    if errors:
        return GuardrailResult(is_valid=False, errors=errors, warnings=warnings, normalized_document=None)

    normalized = normalize_document(document)
    post_errors, post_warnings = _collect_issues(normalized)

    return GuardrailResult(
        is_valid=len(post_errors) == 0,
        errors=post_errors,
        warnings=post_warnings,
        normalized_document=normalized if not post_errors else None,
    )


def _collect_issues(document: IRDocument) -> tuple[list[GuardrailIssue], list[GuardrailIssue]]:
    """Run Step 2's canonical validation (reused, never duplicated - every
    canonical issue becomes an ERROR-severity GuardrailIssue) plus the
    guardrail-only rules in app.domain.guardrails.rules."""

    errors: list[GuardrailIssue] = []
    warnings: list[GuardrailIssue] = []

    canonical_result = validate_document(document)
    for issue in canonical_result.issues:
        errors.append(
            GuardrailIssue(
                code=issue.code,
                severity=GuardrailSeverity.ERROR,
                message=issue.message,
                path=issue.path,
            )
        )

    errors.extend(check_empty_identifiers(document))
    errors.extend(check_dff_port_shape(document))
    errors.extend(check_dff_reset_shape(document))
    warnings.extend(check_annotation_references(document))
    warnings.extend(check_floating_input_ports(document))

    return errors, warnings
