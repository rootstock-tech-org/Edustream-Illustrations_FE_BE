import os
import shutil

import pytest
from fastapi.testclient import TestClient

from app.domain.ir.serialization import to_dict
from app.domain.ir.examples import and_gate_document, multi_bit_connection_document
from app.main import app

client = TestClient(app)

_REAL_YOSYS_PATH = os.environ.get("YOSYS_PATH", "/home/rahulg/tools/oss-cad-suite/bin/yosys")
_YOSYS_AVAILABLE = shutil.which(_REAL_YOSYS_PATH) is not None or shutil.which("yosys") is not None


def _post(document: dict) -> object:
    return client.post("/api/synthesis/generate", json={"document": document})


def test_malformed_document_is_a_200_with_structured_invalid_ir_document() -> None:
    response = _post({"not": "a real IR document"})

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert body["errors"][0]["code"] == "INVALID_IR_DOCUMENT"


def test_unsupported_component_kind_is_a_200_with_honest_failure() -> None:
    response = _post(to_dict(multi_bit_connection_document()))

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is False
    assert body["errors"][0]["code"] == "UNSUPPORTED_COMPONENT_KIND"
    assert body["artifacts"] is None
    assert body["id_mapping"] is None


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_real_and_gate_document_synthesizes_successfully_via_the_real_api() -> None:
    response = _post(to_dict(and_gate_document()))

    assert response.status_code == 200
    body = response.json()
    assert body["is_valid"] is True
    assert body["errors"] == []
    assert body["warnings"] == []
    assert body["artifacts"] is not None
    assert "module m_doc_and_gate" in body["artifacts"]["synthesized_verilog"]
    assert body["id_mapping"] is not None
    assert body["id_mapping"]["unmapped_cell_names"] == []
    mapping_by_id = {m["canonical_component_id"]: m for m in body["id_mapping"]["component_mappings"]}
    assert mapping_by_id["and1"]["synthesized_cell_names"] == ["and1"]
