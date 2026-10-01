import shutil
from pathlib import Path
from unittest.mock import patch

import pytest

from app.domain.physical_design import gds_reader
from app.domain.physical_design.gds_models import GdsReadError, GdsRegionResult, GdsSummary
from app.domain.physical_design.gds_reader import read_gds_region, read_gds_summary

_LIBRELANE_BINARY = "/home/rahulg/experiments/step19_identity/.venv-librelane/bin/librelane"
_LIBRELANE_AVAILABLE = shutil.which(_LIBRELANE_BINARY) is not None or shutil.which("librelane") is not None
_FIXTURE_GDS = Path(__file__).resolve().parent.parent.parent / "fixtures" / "gds" / "and_gate.gds"


def _binary() -> str:
    return _LIBRELANE_BINARY if shutil.which(_LIBRELANE_BINARY) else "librelane"


def test_a_summary_payload_missing_expected_keys_is_an_honest_structured_error_not_a_crash() -> None:
    """Regression test for a REAL bug found during an independent audit:
    a valid-JSON-but-incomplete bridge payload (e.g. a future
    klayout/bridge-script version mismatch) previously propagated a raw,
    unhandled KeyError all the way up - now must become a structured
    GdsReadError, never a crash."""

    with patch.object(gds_reader, "_run_bridge", return_value={"dbu_um": 0.001}):
        result = gds_reader.read_gds_summary(
            _FIXTURE_GDS,
            librelane_binary="/nonexistent/librelane",
            python_binary="/nonexistent/python3",
            timeout_seconds=10,
        )

    assert isinstance(result, GdsReadError)
    assert result.code == "GDS_PARSE_FAILED"


def test_a_region_payload_missing_expected_keys_is_an_honest_structured_error_not_a_crash() -> None:
    with patch.object(gds_reader, "_run_bridge", return_value={"layer": 68}):
        result = gds_reader.read_gds_region(
            _FIXTURE_GDS,
            layer=68,
            datatype=20,
            min_x_um=0,
            min_y_um=0,
            max_x_um=10,
            max_y_um=10,
            limit=100,
            librelane_binary="/nonexistent/librelane",
            python_binary="/nonexistent/python3",
            timeout_seconds=10,
        )

    assert isinstance(result, GdsReadError)
    assert result.code == "GDS_PARSE_FAILED"


def test_missing_gds_file_is_an_honest_structured_error() -> None:
    result = read_gds_summary(
        Path("/nonexistent/path/does-not-exist.gds"),
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=10,
    )

    assert isinstance(result, GdsReadError)
    assert result.code == "GDS_ARTIFACT_NOT_FOUND"


def test_missing_parser_python_binary_is_an_honest_structured_error() -> None:
    result = read_gds_summary(
        _FIXTURE_GDS,
        librelane_binary=_binary(),
        python_binary="/nonexistent/python3-binary",
        timeout_seconds=10,
    )

    assert isinstance(result, GdsReadError)
    assert result.code == "GDS_PARSER_NOT_AVAILABLE"


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_real_gds_summary_reports_real_metadata_from_a_real_file() -> None:
    """The Step 20 GDS-viewer acceptance criterion: parse a REAL,
    previously-generated GDS artifact (a real AND-gate physical-design
    result, fixed as a repo test fixture) and confirm every reported
    value is real, not fabricated - cross-checked against values
    independently verified by hand during implementation."""

    result = read_gds_summary(
        _FIXTURE_GDS,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )

    assert isinstance(result, GdsSummary), result
    assert result.dbu_um == 0.001
    assert result.top_cell_name == "m_doc_and_gate"
    assert result.cell_count == 7
    assert result.bounding_box.min_x_um == 0.0
    assert result.bounding_box.min_y_um == 0.0
    assert result.bounding_box.max_x_um == 300.0
    assert result.bounding_box.max_y_um == 300.0
    assert result.file_size_bytes == _FIXTURE_GDS.stat().st_size
    assert len(result.layers) > 0
    assert result.total_box_count > 0

    # Real SKY130 layer names must be attached for real, known layers -
    # never fabricated for an unrecognized one.
    met1 = next(layer for layer in result.layers if layer.layer == 68 and layer.datatype == 20)
    assert met1.known_name == "met1"
    unknown_layer = next(layer for layer in result.layers if layer.layer == 235 and layer.datatype == 4)
    assert unknown_layer.known_name is None


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_real_gds_region_returns_real_geometry_within_the_requested_viewport() -> None:
    result = read_gds_region(
        _FIXTURE_GDS,
        layer=68,
        datatype=20,
        min_x_um=0,
        min_y_um=0,
        max_x_um=50,
        max_y_um=50,
        limit=2000,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )

    assert isinstance(result, GdsRegionResult), result
    assert result.layer == 68
    assert result.datatype == 20
    assert result.returned_count == len(result.shapes)
    assert result.returned_count > 0
    for shape in result.shapes:
        # A real shape returned for this viewport must actually overlap
        # it (klayout's "touching" semantics return the shape's FULL real
        # geometry, which may legitimately extend beyond the queried
        # region - e.g. a routing strap spanning most of the die - so we
        # only assert overlap here, never full containment).
        xs = [p[0] for p in shape.points_um]
        ys = [p[1] for p in shape.points_um]
        assert max(xs) >= 0 and min(xs) <= 50
        assert max(ys) >= 0 and min(ys) <= 50


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_real_gds_region_honestly_reports_truncation_for_a_low_limit() -> None:
    """met1 (68/20) has tens of thousands of real shapes across the whole
    die - querying the full bounding box with a tiny limit must honestly
    report truncated=True, never silently return a partial result."""

    result = read_gds_region(
        _FIXTURE_GDS,
        layer=68,
        datatype=20,
        min_x_um=0,
        min_y_um=0,
        max_x_um=300,
        max_y_um=300,
        limit=5,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )

    assert isinstance(result, GdsRegionResult), result
    assert result.returned_count == 5
    assert result.truncated is True


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_real_gds_region_applies_the_real_cell_instance_transform() -> None:
    """Regression test for a REAL, CRITICAL bug found during an
    independent audit: shapes living inside a placed cell INSTANCE
    (almost all standard-cell-internal geometry - poly/diff/li1/licon1/
    mcon/nwell etc., placed via a real SREF/AREF with a real translation/
    rotation/mirror) were returned in their LOCAL (untransformed)
    coordinate system instead of the real absolute top-cell coordinates -
    verified live: two COMPLETELY DIFFERENT queried regions returned
    BYTE-IDENTICAL (wrong) points before the fix. `and1`'s real placed
    location (from Step 19's own DEF-derived identity mapping,
    independently re-verified across multiple prior sessions) is exactly
    (10.58, 146.88) um with orientation N (`PLACED (10580 146880) N` in
    the real DEF) - real poly-layer geometry queried right at that real
    location must be genuinely different from real poly-layer geometry
    queried far away, and must fall within (or overlap) each of its own
    respective queried windows."""

    near_and1 = read_gds_region(
        _FIXTURE_GDS,
        layer=66,
        datatype=20,
        min_x_um=10,
        min_y_um=146,
        max_x_um=12,
        max_y_um=148,
        limit=100,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )
    far_away = read_gds_region(
        _FIXTURE_GDS,
        layer=66,
        datatype=20,
        min_x_um=250,
        min_y_um=250,
        max_x_um=260,
        max_y_um=260,
        limit=100,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )

    assert isinstance(near_and1, GdsRegionResult), near_and1
    assert isinstance(far_away, GdsRegionResult), far_away
    assert near_and1.returned_count > 0
    assert far_away.returned_count > 0

    # The two queries must return GENUINELY DIFFERENT geometry - the
    # exact symptom of the bug was these being byte-identical regardless
    # of the queried region.
    near_points = {tuple(p) for shape in near_and1.shapes for p in shape.points_um}
    far_points = {tuple(p) for shape in far_away.shapes for p in shape.points_um}
    assert near_points.isdisjoint(far_points), "region queries returned identical geometry regardless of location - transform not applied"

    # Every shape's real transformed points must actually fall within (or
    # very near) ITS OWN queried window - never systematically offset by
    # a fixed local-coordinate amount.
    for shape in near_and1.shapes:
        xs = [p[0] for p in shape.points_um]
        ys = [p[1] for p in shape.points_um]
        assert max(xs) >= 10 - 1 and min(xs) <= 12 + 1
        assert max(ys) >= 146 - 1 and min(ys) <= 148 + 1
    for shape in far_away.shapes:
        xs = [p[0] for p in shape.points_um]
        ys = [p[1] for p in shape.points_um]
        assert max(xs) >= 250 - 1 and min(xs) <= 260 + 1
        assert max(ys) >= 250 - 1 and min(ys) <= 260 + 1


@pytest.mark.skipif(not _FIXTURE_GDS.is_file(), reason="real GDS fixture is missing")
@pytest.mark.skipif(not _LIBRELANE_AVAILABLE, reason="the real klayout-having venv is not installed in this environment")
def test_real_gds_region_for_a_nonexistent_layer_returns_empty_not_an_error() -> None:
    result = read_gds_region(
        _FIXTURE_GDS,
        layer=9999,
        datatype=9999,
        min_x_um=0,
        min_y_um=0,
        max_x_um=300,
        max_y_um=300,
        limit=100,
        librelane_binary=_binary(),
        python_binary="",
        timeout_seconds=30,
    )

    assert isinstance(result, GdsRegionResult), result
    assert result.returned_count == 0
    assert result.truncated is False
