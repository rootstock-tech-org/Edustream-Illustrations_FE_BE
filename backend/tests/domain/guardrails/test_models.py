import pytest
from pydantic import ValidationError

from app.domain.guardrails.models import GuardrailIssue, GuardrailResult, GuardrailSeverity


def test_severity_values() -> None:
    assert GuardrailSeverity.ERROR.value == "error"
    assert GuardrailSeverity.WARNING.value == "warning"


def test_guardrail_issue_is_frozen() -> None:
    issue = GuardrailIssue(code="X", severity=GuardrailSeverity.ERROR, message="m", path="p")
    with pytest.raises(ValidationError):
        issue.code = "Y"  # type: ignore[misc]


def test_guardrail_result_is_frozen() -> None:
    result = GuardrailResult(is_valid=True)
    with pytest.raises(ValidationError):
        result.is_valid = False  # type: ignore[misc]


def test_guardrail_result_defaults_to_empty_lists_and_no_normalized_document() -> None:
    result = GuardrailResult(is_valid=True)
    assert result.errors == []
    assert result.warnings == []
    assert result.normalized_document is None
