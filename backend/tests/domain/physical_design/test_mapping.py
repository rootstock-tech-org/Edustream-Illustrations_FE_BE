from dataclasses import dataclass

from app.domain.physical_design.mapping import build_identity_mapping, parse_die_area_um
from app.domain.physical_design.models import CellClassification


@dataclass(frozen=True)
class _FakeHdlModule:
    module_name: str
    source_document_id: str
    verilog: str
    top_level_ports: dict[str, str]
    gate_instance_ids: dict[str, str]


_SAMPLE_DEF = """\
VERSION 5.8 ;
DESIGN m_doc_and_gate ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 300000 300000 ) ;
COMPONENTS 4 ;
    - and1/_0_ sky130_fd_sc_hd__and2_2 + PLACED ( 10580 146880 ) N ;
    - input1 sky130_fd_sc_hd__clkdlybuf4s25_1 + SOURCE TIMING + PLACED ( 6900 146880 ) N ;
    - FILL_1 sky130_fd_sc_hd__fill_1 + SOURCE DIST + PLACED ( 0 0 ) N ;
    - _99_ sky130_fd_sc_hd__buf_1 + PLACED ( 1000 1000 ) N ;
END COMPONENTS
NETS 1 ;
    - net1 ( input1 X ) ( and1/_0_ B ) + USE SIGNAL ;
END NETS
PINS 3 ;
    - in_a + NET in_a + DIRECTION INPUT + USE SIGNAL ;
    - in_b + NET in_b + DIRECTION INPUT + USE SIGNAL ;
    - out_y + NET out_y + DIRECTION OUTPUT + USE SIGNAL ;
END PINS
END DESIGN
"""


def _hdl_module() -> _FakeHdlModule:
    return _FakeHdlModule(
        module_name="m_doc_and_gate",
        source_document_id="doc_and_gate",
        verilog="",
        top_level_ports={"in_a": "in_a", "in_b": "in_b", "out_y": "out_y"},
        gate_instance_ids={"and1": "and1"},
    )


def test_canonical_cell_is_mapped_via_hierarchical_prefix() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and1"].physical_cell_names == ["and1/_0_"]
    assert by_id["and1"].note is None


def test_timing_buffer_is_classified_tool_generated_timing_never_canonical() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    unmapped_by_name = {c.cell_name: c for c in mapping.unmapped_cells}
    assert unmapped_by_name["input1"].classification == CellClassification.TOOL_GENERATED_TIMING


def test_fill_cell_is_classified_tool_generated_fill() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    unmapped_by_name = {c.cell_name: c for c in mapping.unmapped_cells}
    assert unmapped_by_name["FILL_1"].classification == CellClassification.TOOL_GENERATED_FILL


def test_cell_with_no_source_tag_and_no_name_match_is_unknown_never_guessed() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    unmapped_by_name = {c.cell_name: c for c in mapping.unmapped_cells}
    assert unmapped_by_name["_99_"].classification == CellClassification.UNKNOWN


def test_top_level_ports_are_mapped_exactly_from_pins_section() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    by_pin = {p.def_pin_name: p.canonical_component_id for p in mapping.port_mappings}
    assert by_pin == {"in_a": "in_a", "in_b": "in_b", "out_y": "out_y"}


def test_connection_identity_is_always_unavailable() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    assert mapping.connection_identity_status.value == "unavailable"


def test_missing_expected_component_gets_an_explicit_note_not_silence() -> None:
    hdl_module = _FakeHdlModule(
        module_name="m_doc_and_gate",
        source_document_id="doc_and_gate",
        verilog="",
        top_level_ports={"in_a": "in_a", "in_b": "in_b", "out_y": "out_y"},
        gate_instance_ids={"and1": "and1", "never_placed": "never_placed"},
    )

    mapping = build_identity_mapping(_SAMPLE_DEF, hdl_module)

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["never_placed"].physical_cell_names == []
    assert by_id["never_placed"].note is not None


def test_edge_case_sanitized_id_is_recovered_via_gate_instance_ids_table() -> None:
    """Mirrors the real calibration experiment: canonical id 'and-1'
    sanitizes to Verilog instance name 'and_1' (Step 18's own sanitizer) -
    the mapper must recover the ORIGINAL canonical id, never the
    sanitized text."""

    def_text = _SAMPLE_DEF.replace("and1/_0_", "and_1/_0_")
    hdl_module = _FakeHdlModule(
        module_name="m_doc_edge_case",
        source_document_id="doc-edge-case",
        verilog="",
        top_level_ports={"in_a": "in-a", "in_b": "in-b", "out_y": "out-y"},
        gate_instance_ids={"and-1": "and_1"},
    )

    mapping = build_identity_mapping(def_text, hdl_module)

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and-1"].physical_cell_names == ["and_1/_0_"]


def test_malformed_def_with_no_components_section_never_crashes() -> None:
    mapping = build_identity_mapping("not a real def file", _hdl_module())

    assert mapping.component_mappings[0].physical_cell_names == []
    assert mapping.unmapped_cells == []


def test_die_area_is_parsed_and_converted_to_real_microns() -> None:
    die_area = parse_die_area_um(_SAMPLE_DEF)

    assert die_area == (300.0, 300.0)


def test_missing_diearea_returns_none_never_fabricated() -> None:
    die_area = parse_die_area_um("no diearea statement here")

    assert die_area is None


def test_cell_placements_are_extracted_in_real_microns_for_every_cell() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    by_name = {p.cell_name: p for p in mapping.cell_placements}
    assert by_name["and1/_0_"].x == 10.58
    assert by_name["and1/_0_"].y == 146.88
    assert by_name["and1/_0_"].orientation == "N"
    assert by_name["and1/_0_"].classification == CellClassification.CANONICAL
    assert by_name["and1/_0_"].canonical_component_id == "and1"


def test_tool_generated_cell_placement_has_no_canonical_id() -> None:
    mapping = build_identity_mapping(_SAMPLE_DEF, _hdl_module())

    by_name = {p.cell_name: p for p in mapping.cell_placements}
    assert by_name["input1"].canonical_component_id is None
    assert by_name["input1"].classification == CellClassification.TOOL_GENERATED_TIMING
