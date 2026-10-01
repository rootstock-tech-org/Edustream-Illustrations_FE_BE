from app.domain.hdl.generator import generate_verilog
from app.domain.identity.builder import build_design_identity_ledger
from app.domain.identity.models import DesignLayer
from app.domain.ir.examples import and_gate_document, dff_document
from app.domain.physical_design.mapping import build_identity_mapping


_REAL_DEF_FIXTURE = """
DESIGN m_doc_and_gate ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 300000 300000 ) ;
COMPONENTS 3 ;
- and1 sky130_fd_sc_hd__and2_2 + PLACED ( 10580 146880 ) N ;
- input1 sky130_fd_sc_hd__clkdlybuf4s25_1 + SOURCE TIMING + PLACED ( 5000 5000 ) N ;
- FILLER_0_1 sky130_fd_sc_hd__fill_1 + SOURCE DIST + PLACED ( 0 0 ) N ;
END COMPONENTS
PINS 3 ;
- in_a + NET in_a ;
- in_b + NET in_b ;
- out_y + NET out_y ;
END PINS
"""


def _and_gate_hdl_module():
    result = generate_verilog(and_gate_document())
    assert result.success
    return result.module


def test_ledger_is_logical_only_when_no_hdl_or_physical_data_given() -> None:
    document = and_gate_document()

    ledger = build_design_identity_ledger(document)

    assert ledger.document_id == document.id
    assert ledger.hdl_module_name is None
    assert ledger.component_count == len(document.components)
    assert ledger.mapped_component_count == 0
    assert ledger.connection_identity_status == "unavailable"
    for record in ledger.records:
        assert record.layers_present == [DesignLayer.LOGICAL]
        assert record.hdl_instance_name is None
        assert record.physical_cell_names == []


def test_ledger_adds_hdl_layer_from_a_real_hdl_module() -> None:
    document = and_gate_document()
    hdl_module = _and_gate_hdl_module()

    ledger = build_design_identity_ledger(document, hdl_module=hdl_module)

    assert ledger.hdl_module_name == hdl_module.module_name
    and1_record = next(r for r in ledger.records if r.canonical_component_id == "and1")
    assert and1_record.hdl_instance_name == hdl_module.gate_instance_ids["and1"]
    assert DesignLayer.HDL in and1_record.layers_present
    assert DesignLayer.PHYSICAL not in and1_record.layers_present

    # top-level input/output components get their HDL identity from
    # top_level_ports, a DIFFERENTLY-keyed dict than gate_instance_ids.
    input_record = next(r for r in ledger.records if r.canonical_component_id == "in_a")
    assert input_record.hdl_instance_name is not None
    assert DesignLayer.HDL in input_record.layers_present


def test_ledger_adds_real_physical_layer_and_honest_unmapped_note() -> None:
    document = and_gate_document()
    hdl_module = _and_gate_hdl_module()
    identity_mapping = build_identity_mapping(_REAL_DEF_FIXTURE, hdl_module)

    ledger = build_design_identity_ledger(
        document, hdl_module=hdl_module, identity_mapping=identity_mapping
    )

    and1_record = next(r for r in ledger.records if r.canonical_component_id == "and1")
    assert and1_record.physical_cell_names == ["and1"]
    assert DesignLayer.PHYSICAL in and1_record.layers_present
    assert and1_record.note is None

    # in_a/in_b/out_y have real DEF PIN matches (top-level ports) in this
    # fixture DEF - honest PHYSICAL identity via a boundary pin, not a
    # placed cell, matching build_identity_mapping's own convention.
    in_b_record = next(r for r in ledger.records if r.canonical_component_id == "in_b")
    assert in_b_record.physical_cell_names == []
    assert in_b_record.def_pin_name == "in_b"
    assert DesignLayer.PHYSICAL in in_b_record.layers_present
    assert in_b_record.note is None

    assert ledger.mapped_component_count == 4  # and1 (cell) + in_a/in_b/out_y (pin)
    assert ledger.unmapped_physical_cell_count == 2  # input1 (TIMING) + FILLER_0_1 (DIST)


def test_ledger_handles_a_document_with_zero_components() -> None:
    document = and_gate_document().model_copy(update={"components": [], "connections": [], "root_component_ids": []})

    ledger = build_design_identity_ledger(document)

    assert ledger.component_count == 0
    assert ledger.mapped_component_count == 0
    assert ledger.records == []


def test_ledger_covers_a_real_dff_component_with_zero_new_code_needed() -> None:
    """Step 21 follow-up: proves this identity-ledger builder (Step 21's
    own new code) required ZERO changes to support a sequential DFF -
    it already generically projects whatever is in HdlModule.
    gate_instance_ids, which now includes DFF instances too."""

    document = dff_document()
    hdl_module = generate_verilog(document).module
    assert hdl_module is not None

    ledger = build_design_identity_ledger(document, hdl_module=hdl_module)

    dff_record = next(r for r in ledger.records if r.canonical_component_id == "dff1")
    assert dff_record.canonical_kind == "DFF"
    assert dff_record.hdl_instance_name == "dff1"
    assert DesignLayer.HDL in dff_record.layers_present
