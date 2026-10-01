import shutil

from app.domain.hdl.generator import generate_verilog
from app.domain.ir.examples import and_gate_document, dff_document, mux_2to1_document, multi_bit_connection_document
from app.domain.ir.models import (
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)
from datetime import datetime, timezone

import pytest


def test_and_gate_generates_valid_module_with_expected_identity_anchors() -> None:
    result = generate_verilog(and_gate_document())

    assert result.success is True
    assert result.module is not None
    assert result.module.module_name == "m_doc_and_gate"
    assert "module _AND_2IN_1W" in result.module.verilog
    assert "module m_doc_and_gate" in result.module.verilog
    assert result.module.top_level_ports == {"in_a": "in_a", "in_b": "in_b", "out_y": "out_y"}
    assert result.module.gate_instance_ids == {"and1": "and1"}


def test_mux_generates_one_shape_definition_per_distinct_gate_shape() -> None:
    result = generate_verilog(mux_2to1_document())

    assert result.success is True
    assert result.module is not None
    # 2 AND gates share ONE _AND_2IN_1W definition, plus 1 NOT + 1 OR shape.
    assert result.module.verilog.count("module _AND_2IN_1W") == 1
    assert result.module.verilog.count("module _NOT_1IN_1W") == 1
    assert result.module.verilog.count("module _OR_2IN_1W") == 1
    assert set(result.module.gate_instance_ids) == {"and_a", "and_b", "not_sel", "or1"}
    # Every gate instance name equals its own canonical component id.
    for component_id, instance_name in result.module.gate_instance_ids.items():
        assert instance_name == component_id


def test_multi_bit_connection_document_has_no_gates_and_is_unsupported_free() -> None:
    # reg_a/reg_b use kind "REGISTER" (not "DFF") - a deliberately DIFFERENT
    # kind string from Step 21's new real "DFF" support, so this document
    # must still fail honestly rather than emit fabricated HDL.
    result = generate_verilog(multi_bit_connection_document())

    assert result.success is False
    assert result.failure_reason == "UNSUPPORTED_COMPONENT_KIND"
    assert "REGISTER" in result.message


def test_undriven_input_port_is_an_honest_failure_not_a_default_value() -> None:
    in_a = Component(
        id="in_a", kind="input", name="A",
        ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    and1 = Component(
        id="and1", kind="AND", name="AND1",
        ports=[
            Port(id="and1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="and1.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="and1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_y = Component(
        id="out_y", kind="output", name="Y",
        ports=[Port(id="out_y.in", name="in", direction=PortDirection.INPUT, width=1)],
    )
    # and1.b is never connected to anything - a genuinely floating input.
    document = IRDocument(
        id="doc_floating",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Floating Input",
        components=[in_a, and1, out_y],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="and1", port_id="and1.a")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="and1", port_id="and1.y"), target=ConnectionEndpoint(component_id="out_y", port_id="out_y.in")),
        ],
        root_component_ids=["in_a", "and1", "out_y"],
        provenance=Provenance(source="manual", created_at=datetime(2026, 9, 14, tzinfo=timezone.utc)),
    )

    result = generate_verilog(document)

    assert result.success is False
    assert result.failure_reason == "UNDRIVEN_PORT"


def test_invalid_ir_document_fails_via_guardrails_never_via_a_crash() -> None:
    in_a = Component(
        id="in_a", kind="input", name="A",
        ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    # A connection referencing a nonexistent component - guardrails/IR
    # validation must reject this before HDL generation ever sees it.
    document = IRDocument(
        id="doc_broken",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Broken",
        components=[in_a],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="missing", port_id="missing.in")),
        ],
        root_component_ids=["in_a"],
        provenance=Provenance(source="manual", created_at=datetime(2026, 9, 14, tzinfo=timezone.utc)),
    )

    result = generate_verilog(document)

    assert result.success is False
    assert result.failure_reason == "INVALID_IR"
    assert len(result.errors) > 0


_YOSYS_AVAILABLE = shutil.which("/home/rahulg/tools/oss-cad-suite/bin/yosys") is not None or shutil.which("yosys") is not None


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_generated_and_gate_verilog_is_real_syntactically_valid_verilog_to_yosys() -> None:
    """The generated Verilog is checked against the REAL Yosys parser
    (read_verilog + hierarchy -check) - not just eyeballed - to prove it
    is genuinely synthesizable HDL, not merely well-formed-looking text."""

    import os
    import subprocess
    import tempfile

    result = generate_verilog(and_gate_document())
    assert result.success is True
    assert result.module is not None

    yosys_path = os.environ.get("YOSYS_PATH", "/home/rahulg/tools/oss-cad-suite/bin/yosys")
    if shutil.which(yosys_path) is None:
        yosys_path = "yosys"

    with tempfile.TemporaryDirectory() as tmp:
        design_path = f"{tmp}/design.v"
        with open(design_path, "w") as handle:
            handle.write(result.module.verilog)

        proc = subprocess.run(
            [yosys_path, "-p", f"read_verilog {design_path}; hierarchy -check -top {result.module.module_name}"],
            capture_output=True,
            text=True,
            timeout=30,
        )

    assert proc.returncode == 0, proc.stderr


# ---------------------------------------------------------------------------
# Step 21 follow-up: real sequential logic (D flip-flop / register) support.
# ---------------------------------------------------------------------------


def test_dff_document_generates_valid_module_with_expected_identity_anchors() -> None:
    result = generate_verilog(dff_document())

    assert result.success is True
    assert result.module is not None
    assert result.module.module_name == "m_doc_dff"
    assert "module _DFF_1W" in result.module.verilog
    assert "always @(posedge clk) q <= d;" in result.module.verilog
    assert result.module.top_level_ports == {"in_d": "in_d", "in_clk": "in_clk", "out_q": "out_q"}
    assert result.module.gate_instance_ids == {"dff1": "dff1"}
    # No reset signal is ever fabricated - see the module's own docstring.
    assert "rst" not in result.module.verilog.lower()
    assert "reset" not in result.module.verilog.lower()


def test_dff_shape_is_parameterized_by_width_and_reused_across_instances() -> None:
    in_d = Component(id="in_d", kind="input", name="D", ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=4)])
    in_clk = Component(id="in_clk", kind="input", name="CLK", ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    dff_a = Component(id="dff_a", kind="DFF", name="DFFA", ports=[
        Port(id="dff_a.d", name="d", direction=PortDirection.INPUT, width=4),
        Port(id="dff_a.clk", name="clk", direction=PortDirection.INPUT, width=1),
        Port(id="dff_a.q", name="q", direction=PortDirection.OUTPUT, width=4),
    ])
    dff_b = Component(id="dff_b", kind="DFF", name="DFFB", ports=[
        Port(id="dff_b.d", name="d", direction=PortDirection.INPUT, width=4),
        Port(id="dff_b.clk", name="clk", direction=PortDirection.INPUT, width=1),
        Port(id="dff_b.q", name="q", direction=PortDirection.OUTPUT, width=4),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=4)])

    document = IRDocument(
        id="doc_dff_width4",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Two 4-bit DFFs",
        components=[in_d, in_clk, dff_a, dff_b, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff_a", port_id="dff_a.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff_a", port_id="dff_a.clk")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="dff_a", port_id="dff_a.q"), target=ConnectionEndpoint(component_id="dff_b", port_id="dff_b.d")),
            Connection(id="conn_4", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff_b", port_id="dff_b.clk")),
            Connection(id="conn_5", source=ConnectionEndpoint(component_id="dff_b", port_id="dff_b.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "dff_a", "dff_b", "out_q"],
        provenance=Provenance(source="manual", created_at=datetime(2026, 9, 14, tzinfo=timezone.utc)),
    )

    result = generate_verilog(document)

    assert result.success is True
    assert result.module is not None
    # ONE shared 4-bit DFF shape definition, reused for both instances.
    assert result.module.verilog.count("module _DFF_4W") == 1
    assert set(result.module.gate_instance_ids) == {"dff_a", "dff_b"}


def test_dff_with_undriven_d_port_is_an_honest_failure() -> None:
    in_clk = Component(id="in_clk", kind="input", name="CLK", ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    dff1 = Component(id="dff1", kind="DFF", name="DFF1", ports=[
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)])

    # dff1.d is never connected to anything.
    document = IRDocument(
        id="doc_dff_undriven_d",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Undriven D",
        components=[in_clk, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_clk", "dff1", "out_q"],
        provenance=Provenance(source="manual", created_at=datetime(2026, 9, 14, tzinfo=timezone.utc)),
    )

    result = generate_verilog(document)

    assert result.success is False
    assert result.failure_reason == "UNDRIVEN_PORT"


def test_dff_with_missing_required_port_is_rejected_by_guardrails_before_hdl_generation() -> None:
    # A "DFF" component missing its 'clk' port entirely - app.domain.
    # guardrails.rules.check_dff_port_shape must reject this (INVALID_IR),
    # never reach this function's own defensive DFF branch at all.
    in_d = Component(id="in_d", kind="input", name="D", ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    dff1 = Component(id="dff1", kind="DFF", name="DFF1", ports=[
        Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
        Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
    ])
    out_q = Component(id="out_q", kind="output", name="Q", ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)])

    document = IRDocument(
        id="doc_dff_no_clk",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="DFF Missing Clock",
        components=[in_d, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "dff1", "out_q"],
        provenance=Provenance(source="manual", created_at=datetime(2026, 9, 14, tzinfo=timezone.utc)),
    )

    result = generate_verilog(document)

    assert result.success is False
    assert result.failure_reason == "INVALID_IR"
    assert any(error.code == "DFF_MISSING_CLK_PORT" for error in result.errors)


@pytest.mark.skipif(not _YOSYS_AVAILABLE, reason="yosys is not installed in this environment")
def test_dff_verilog_synthesizes_to_a_real_dff_cell_with_preserved_instance_identity() -> None:
    """The generated DFF Verilog is checked against the REAL Yosys parser
    (read_verilog + hierarchy -check + proc + opt), and the resulting real
    JSON netlist is inspected to prove the 'dff1' submodule instance name
    (and its canonical_component_id attribute) genuinely survive real
    synthesis - not just that the text looks plausible."""

    import json
    import os
    import subprocess
    import tempfile

    result = generate_verilog(dff_document())
    assert result.success is True
    assert result.module is not None

    yosys_path = os.environ.get("YOSYS_PATH", "/home/rahulg/tools/oss-cad-suite/bin/yosys")
    if shutil.which(yosys_path) is None:
        yosys_path = "yosys"

    with tempfile.TemporaryDirectory() as tmp:
        design_path = f"{tmp}/design.v"
        json_path = f"{tmp}/out.json"
        with open(design_path, "w") as handle:
            handle.write(result.module.verilog)

        proc = subprocess.run(
            [
                yosys_path,
                "-p",
                f"read_verilog {design_path}; hierarchy -check -top {result.module.module_name}; "
                f"proc; opt; write_json {json_path}",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert proc.returncode == 0, proc.stderr

        with open(json_path) as handle:
            netlist = json.load(handle)

    top_module = netlist["modules"][result.module.module_name]
    dff_cell = top_module["cells"]["dff1"]
    assert dff_cell["type"] == "_DFF_1W"
    assert dff_cell["attributes"]["canonical_component_id"] == "dff1"

    # Inside the _DFF_1W submodule, the sequential process really did
    # become a real $dff RTLIL primitive (proof this is genuine
    # sequential logic, not a combinational pass-through).
    dff_shape_module = netlist["modules"]["_DFF_1W"]
    cell_types = {cell["type"] for cell in dff_shape_module["cells"].values()}
    assert "$dff" in cell_types
