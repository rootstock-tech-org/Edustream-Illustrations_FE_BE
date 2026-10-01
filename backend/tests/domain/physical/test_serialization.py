import json
from pathlib import Path

from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.physical.generator import generate_physical_layout
from app.domain.physical.serialization import from_dict, from_json, json_schema, to_dict, to_json

_SCHEMA_PATH = Path(__file__).resolve().parents[4] / "shared" / "physical-schema" / "physical.schema.json"


def test_json_round_trip_preserves_equality() -> None:
    physical = generate_physical_layout(and_gate_document()).physical
    assert physical is not None

    restored = from_json(to_json(physical))
    assert restored == physical


def test_dict_round_trip_preserves_equality() -> None:
    physical = generate_physical_layout(hierarchical_module_document()).physical
    assert physical is not None

    restored = from_dict(to_dict(physical))
    assert restored == physical


def test_to_dict_is_json_compatible() -> None:
    physical = generate_physical_layout(and_gate_document()).physical
    assert physical is not None

    payload = to_dict(physical)
    reloaded = json.loads(json.dumps(payload))
    assert reloaded["source_document_id"] == physical.source_document_id


def test_json_schema_matches_checked_in_artifact() -> None:
    generated = json_schema()
    on_disk = json.loads(_SCHEMA_PATH.read_text())

    assert generated == on_disk, (
        "shared/physical-schema/physical.schema.json is out of date - regenerate it from "
        "app.domain.physical.serialization.json_schema()."
    )
