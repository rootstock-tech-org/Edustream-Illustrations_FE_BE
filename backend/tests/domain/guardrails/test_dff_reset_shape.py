"""Tests for app.domain.guardrails.rules.check_dff_reset_shape (Step 22:
DFF reset semantics). Component.reset is the sole signal of reset
existence - never a 'reset' port's name alone - and these tests exercise
both directions of that contract plus the port-shape checks that apply
once reset is declared.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.guardrails.models import GuardrailSeverity
from app.domain.guardrails.rules import check_dff_reset_shape
from app.domain.ir.models import (
    Component,
    Connection,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
    ResetPolarity,
    ResetSpec,
    ResetTiming,
)

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _document(dff: Component, extra_components: list[Component]) -> IRDocument:
    components = [*extra_components, dff]
    return IRDocument(
        id="doc_dff_reset_shape",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Reset Shape Test",
        components=components,
        connections=[],
        root_component_ids=[c.id for c in components],
        provenance=_provenance(),
    )


def _base_ports(include_reset: bool) -> list[Port]:
    ports = [
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ]
    if include_reset:
        ports.append(Port(id="dff1.reset", name="reset", direction=PortDirection.INPUT, width=1))
    return ports


def test_no_reset_declared_and_no_reset_port_is_valid() -> None:
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=_base_ports(include_reset=False), reset=None)
    document = _document(dff, [])

    issues = check_dff_reset_shape(document)

    assert issues == []


def test_reset_port_present_without_declared_semantics_is_rejected() -> None:
    # A port literally named 'reset' with component.reset left None - the
    # exact ambiguous case check_dff_reset_shape must never silently accept.
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=_base_ports(include_reset=True), reset=None)
    document = _document(dff, [])

    issues = check_dff_reset_shape(document)

    assert len(issues) == 1
    assert issues[0].code == "DFF_UNDECLARED_RESET_PORT"
    assert issues[0].severity == GuardrailSeverity.ERROR


def test_declared_reset_without_reset_port_is_rejected() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.SYNCHRONOUS)
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=_base_ports(include_reset=False), reset=reset_spec)
    document = _document(dff, [])

    issues = check_dff_reset_shape(document)

    assert len(issues) == 1
    assert issues[0].code == "DFF_MISSING_RESET_PORT"
    assert issues[0].severity == GuardrailSeverity.ERROR


def test_declared_reset_with_wrong_direction_is_rejected() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.SYNCHRONOUS)
    ports = _base_ports(include_reset=False) + [
        Port(id="dff1.reset", name="reset", direction=PortDirection.OUTPUT, width=1)
    ]
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=ports, reset=reset_spec)
    document = _document(dff, [])

    issues = check_dff_reset_shape(document)

    assert any(issue.code == "DFF_INVALID_RESET_DIRECTION" for issue in issues)


def test_declared_reset_with_wrong_width_is_rejected() -> None:
    reset_spec = ResetSpec(polarity=ResetPolarity.ACTIVE_HIGH, timing=ResetTiming.SYNCHRONOUS)
    ports = _base_ports(include_reset=False) + [
        Port(id="dff1.reset", name="reset", direction=PortDirection.INPUT, width=4)
    ]
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=ports, reset=reset_spec)
    document = _document(dff, [])

    issues = check_dff_reset_shape(document)

    assert any(issue.code == "DFF_INVALID_RESET_WIDTH" for issue in issues)


def test_all_four_polarity_timing_combinations_with_correct_shape_are_valid() -> None:
    for polarity in (ResetPolarity.ACTIVE_HIGH, ResetPolarity.ACTIVE_LOW):
        for timing in (ResetTiming.SYNCHRONOUS, ResetTiming.ASYNCHRONOUS):
            reset_spec = ResetSpec(polarity=polarity, timing=timing)
            dff = Component(
                id="dff1", kind="DFF", name="DFF1", ports=_base_ports(include_reset=True), reset=reset_spec
            )
            document = _document(dff, [])

            issues = check_dff_reset_shape(document)

            assert issues == [], f"unexpected issues for {polarity}/{timing}: {issues}"


def test_non_dff_component_is_ignored_even_with_a_reset_port() -> None:
    # A non-DFF "REGISTER"-kind component with a stray 'reset' port must
    # never be flagged by this DFF-specific rule.
    other = Component(
        id="reg1",
        kind="REGISTER",
        name="REG1",
        ports=[Port(id="reg1.reset", name="reset", direction=PortDirection.INPUT, width=1)],
    )
    dff = Component(id="dff1", kind="DFF", name="DFF1", ports=_base_ports(include_reset=False), reset=None)
    document = _document(dff, [other])

    issues = check_dff_reset_shape(document)

    assert issues == []
