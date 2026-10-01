import json
from pathlib import Path

from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.ir.serialization import from_dict, from_json, json_schema, to_dict, to_json

_SCHEMA_PATH = Path(__file__).resolve().parents[4] / "shared" / "ir-schema" / "ir.schema.json"


def test_json_round_trip_preserves_equality() -> None:
    document = and_gate_document()

    restored = from_json(to_json(document))

    assert restored == document


def test_dict_round_trip_preserves_equality() -> None:
    document = hierarchical_module_document()

    restored = from_dict(to_dict(document))

    assert restored == document


def test_to_dict_is_json_compatible() -> None:
    document = and_gate_document()

    payload = to_dict(document)
    # Round-trips through the stdlib json module to prove it is genuinely
    # JSON-safe, not just python-native types that happen to look ok.
    reloaded = json.loads(json.dumps(payload))

    assert reloaded["id"] == document.id


def test_json_schema_matches_checked_in_artifact() -> None:
    generated = json_schema()
    on_disk = json.loads(_SCHEMA_PATH.read_text())

    assert generated == on_disk, (
        "shared/ir-schema/ir.schema.json is out of date - regenerate it from "
        "app.domain.ir.serialization.json_schema()."
    )
