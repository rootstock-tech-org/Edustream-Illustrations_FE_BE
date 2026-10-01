from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.domain.ir.examples import and_gate_document
from app.domain.ir.models import (
    BitRange,
    Component,
    IRDocument,
    Parameter,
    Port,
    PortDirection,
    Provenance,
)


def test_port_requires_positive_width() -> None:
    with pytest.raises(ValidationError):
        Port(id="p1", name="a", direction=PortDirection.INPUT, width=0)


def test_bit_range_rejects_msb_less_than_lsb() -> None:
    with pytest.raises(ValidationError):
        BitRange(msb=1, lsb=3)


def test_bit_range_width() -> None:
    assert BitRange(msb=7, lsb=0).width == 8


def test_port_rejects_bit_range_wider_than_port_width() -> None:
    with pytest.raises(ValidationError):
        Port(id="p1", name="a", direction=PortDirection.INPUT, width=2, bit_range=BitRange(msb=7, lsb=0))


def test_component_kind_accepts_arbitrary_strings() -> None:
    component = Component(id="c1", kind="SOME_FUTURE_CONCEPT", name="C1")
    assert component.kind == "SOME_FUTURE_CONCEPT"


def test_components_are_frozen() -> None:
    component = Component(id="c1", kind="AND", name="C1")
    with pytest.raises(ValidationError):
        component.name = "renamed"  # type: ignore[misc]


def test_ir_document_is_frozen() -> None:
    document = and_gate_document()
    with pytest.raises(ValidationError):
        document.name = "renamed"  # type: ignore[misc]


def test_ir_document_component_list_cannot_be_reassigned() -> None:
    document = and_gate_document()
    original_count = len(document.components)
    with pytest.raises(ValidationError):
        document.components = []  # type: ignore[misc]
    assert len(document.components) == original_count


def test_provenance_requires_source_and_created_at() -> None:
    provenance = Provenance(source="manual", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert provenance.source == "manual"


def test_provenance_supports_request_id_and_notes() -> None:
    provenance = Provenance(
        source="ai_generated",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        request_id="req_123",
        notes="generated from a prompt",
    )
    assert provenance.request_id == "req_123"
    assert provenance.notes == "generated from a prompt"


def test_parameter_holds_json_value() -> None:
    parameter = Parameter(name="width", value=8)
    assert parameter.value == 8


def test_ir_document_requires_schema_version() -> None:
    with pytest.raises(ValidationError):
        IRDocument(id="d1", design_version="1", name="D1")  # type: ignore[call-arg]


def test_ir_document_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        IRDocument(
            id="d1",
            schema_version="1.0.0",
            design_version="1",
            name="D1",
            not_a_real_field="oops",  # type: ignore[call-arg]
        )
