import shutil
import tempfile
from pathlib import Path

import pytest

from app.domain.ir.examples import and_gate_document, mux_2to1_document
from app.domain.physical_design.models import CellClassification
from app.domain.physical_design.pipeline import run_physical_design

_LIBRELANE_BINARY = "/home/rahulg/experiments/step19_identity/.venv-librelane/bin/librelane"
_LIBRELANE_AVAILABLE = shutil.which(_LIBRELANE_BINARY) is not None or shutil.which("librelane") is not None
_REAL_TOOL_TIMEOUT = 900.0


def _binary() -> str:
    return _LIBRELANE_BINARY if shutil.which(_LIBRELANE_BINARY) else "librelane"


@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="LibreLane is not installed in this environment")
def test_real_and_gate_physical_design_succeeds_with_exact_identity() -> None:
    """The Step 19 acceptance criterion: a real Canonical IR document ->
    real HDL -> real LibreLane/SKY130/OpenROAD -> real DEF/GDS with a
    correctly, honestly reconstructed canonical identity mapping."""

    with tempfile.TemporaryDirectory(dir=str(Path.home())) as tmp:
        result = run_physical_design(
            and_gate_document(),
            librelane_binary=_binary(),
            timeout_seconds=_REAL_TOOL_TIMEOUT,
            work_dir=Path(tmp),
        )

    assert result.is_valid is True, result.errors
    assert result.signoff is not None
    assert result.signoff.drc_passed is True
    assert result.signoff.lvs_passed is True
    assert result.signoff.antenna_passed is True

    assert result.identity_mapping is not None
    mapping_by_id = {m.canonical_component_id: m for m in result.identity_mapping.component_mappings}
    assert mapping_by_id["and1"].physical_cell_names == ["and1/_0_"]

    assert result.identity_mapping.connection_identity_status.value == "unavailable"

    # Tool-generated cells (timing buffers/fill/tap) must never be
    # attributed to a canonical component.
    for unmapped in result.identity_mapping.unmapped_cells:
        assert unmapped.classification in (
            CellClassification.TOOL_GENERATED_FILL,
            CellClassification.TOOL_GENERATED_TIMING,
            CellClassification.UNKNOWN,
        )

    artifact_types = {artifact.artifact_type for artifact in result.artifacts}
    assert "def" in artifact_types
    assert "gds" in artifact_types
    assert "netlist" in artifact_types
    for artifact in result.artifacts:
        assert artifact.size_bytes > 0


@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="LibreLane is not installed in this environment")
def test_real_mux_physical_design_maps_every_gate_exactly() -> None:
    with tempfile.TemporaryDirectory(dir=str(Path.home())) as tmp:
        result = run_physical_design(
            mux_2to1_document(),
            librelane_binary=_binary(),
            timeout_seconds=_REAL_TOOL_TIMEOUT,
            work_dir=Path(tmp),
        )

    assert result.is_valid is True, result.errors
    assert result.signoff is not None
    assert result.signoff.drc_passed is True
    assert result.signoff.lvs_passed is True

    assert result.identity_mapping is not None
    mapping_by_id = {m.canonical_component_id: m for m in result.identity_mapping.component_mappings}
    for component_id in ("and_a", "and_b", "not_sel", "or1"):
        assert mapping_by_id[component_id].physical_cell_names == [f"{component_id}/_0_"]
