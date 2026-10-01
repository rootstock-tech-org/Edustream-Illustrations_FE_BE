import pytest
from pydantic import ValidationError

from app.domain.prompt.intent import VLSIIntent


def test_minimal_valid_intent_parses() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "AND Gate",
        "components": [
            {"id": "in_a", "kind": "input", "name": "A"},
            {"id": "and1", "kind": "AND", "name": "AND1"},
        ],
        "connections": [
            {"source_id": "in_a", "target_id": "and1", "target_port": "a"},
        ],
    })
    assert intent.circuit_name == "AND Gate"
    assert len(intent.components) == 2
    assert intent.components[1].ports is None


def test_explicit_ports_for_compound_kind_parse() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "4-bit Adder",
        "components": [
            {
                "id": "adder",
                "kind": "adder",
                "name": "Ripple Carry Adder",
                "ports": [
                    {"name": "a", "direction": "input", "width": 4},
                    {"name": "b", "direction": "input", "width": 4},
                    {"name": "cin", "direction": "input", "width": 1},
                    {"name": "sum", "direction": "output", "width": 4},
                    {"name": "cout", "direction": "output", "width": 1},
                ],
            },
        ],
        "connections": [],
    })
    assert intent.components[0].ports is not None
    assert len(intent.components[0].ports) == 5


def test_extra_field_rejected() -> None:
    with pytest.raises(ValidationError):
        VLSIIntent.model_validate({
            "circuit_name": "X",
            "components": [],
            "connections": [],
            "unexpected_field": "should not be allowed",
        })


def test_missing_required_field_rejected() -> None:
    with pytest.raises(ValidationError):
        VLSIIntent.model_validate({"components": [], "connections": []})


def test_invalid_port_direction_rejected() -> None:
    with pytest.raises(ValidationError):
        VLSIIntent.model_validate({
            "circuit_name": "X",
            "components": [
                {"id": "a", "kind": "adder", "name": "A", "ports": [{"name": "p", "direction": "sideways"}]},
            ],
            "connections": [],
        })
