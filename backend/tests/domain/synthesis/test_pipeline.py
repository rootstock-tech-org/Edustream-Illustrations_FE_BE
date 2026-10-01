import os
import shutil

import pytest

from app.domain.ir.examples import and_gate_document, mux_2to1_document, multi_bit_connection_document
from app.domain.synthesis.pipeline import run_synthesis

_REAL_YOSYS_PATH = os.environ.get("YOSYS_PATH", "/home/rahulg/tools/oss-cad-suite/bin/yosys")
_YOSYS_AVAILABLE = shutil.which(_REAL_YOSYS_PATH) is not None or shutil.which("yosys") is not None


def test_unsupported_kind_fails_before_ever_touching_yosys() -> None:
    result = run_synthesis(multi_bit_connection_document())

    assert result.is_valid is False
    assert result.errors[0].code == "UNSUPPORTED_COMPONENT_KIND"
    assert result.artifacts is None
    assert result.id_mapping is None


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_real_end_to_end_and_gate_synthesis_has_perfect_identity_mapping() -> None:
    """The Step 18 success criterion: a real IR document -> real Verilog
    -> the REAL Yosys executable -> real artifacts -> every canonical
    component id maps back to exactly one real synthesized cell name."""

    result = run_synthesis(and_gate_document())

    assert result.is_valid is True
    assert result.errors == []
    assert result.warnings == []
    assert result.artifacts is not None
    assert "module m_doc_and_gate" in result.artifacts.synthesized_verilog
    assert result.id_mapping is not None
    assert result.id_mapping.unmapped_cell_names == []

    mapping_by_id = {m.canonical_component_id: m for m in result.id_mapping.component_mappings}
    assert mapping_by_id["and1"].synthesized_cell_names == ["and1"]
    assert mapping_by_id["and1"].note is None
    assert result.id_mapping.top_level_ports == {"in_a": "in_a", "in_b": "in_b", "out_y": "out_y"}


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_real_end_to_end_mux_synthesis_maps_every_gate_exactly() -> None:
    result = run_synthesis(mux_2to1_document())

    assert result.is_valid is True
    assert result.warnings == []
    assert result.id_mapping is not None
    assert result.id_mapping.unmapped_cell_names == []

    mapping_by_id = {m.canonical_component_id: m for m in result.id_mapping.component_mappings}
    for component_id in ("and_a", "and_b", "not_sel", "or1"):
        assert mapping_by_id[component_id].synthesized_cell_names == [component_id]
        assert mapping_by_id[component_id].note is None
