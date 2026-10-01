"""Small, hand-written golden IRDocument fixtures.

These are valid, realistic canonical IR documents used both as tests and as
a foundation for future golden-regression fixtures. Kept intentionally
small (5 examples) - a later step will expand this set to 15-20.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.ir.models import (
    BitRange,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def simple_inverter_document() -> IRDocument:
    """A single NOT gate wired between an input and an output terminal."""

    in_a = Component(
        id="in_a", kind="input", name="A",
        ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    not1 = Component(
        id="not1", kind="NOT", name="NOT1",
        ports=[
            Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="not1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_y = Component(
        id="out_y", kind="output", name="Y",
        ports=[Port(id="out_y.in", name="in", direction=PortDirection.INPUT, width=1)],
    )

    return IRDocument(
        id="doc_inverter",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Simple Inverter",
        components=[in_a, not1, out_y],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"),
                target=ConnectionEndpoint(component_id="not1", port_id="not1.a"),
            ),
            Connection(
                id="conn_2",
                source=ConnectionEndpoint(component_id="not1", port_id="not1.y"),
                target=ConnectionEndpoint(component_id="out_y", port_id="out_y.in"),
            ),
        ],
        root_component_ids=["in_a", "not1", "out_y"],
        provenance=_provenance(),
    )


def and_gate_document() -> IRDocument:
    """A single 2-input AND gate wired between two inputs and one output."""

    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_b = Component(id="in_b", kind="input", name="B", ports=[Port(id="in_b.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    and1 = Component(
        id="and1", kind="AND", name="AND1",
        ports=[
            Port(id="and1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="and1.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="and1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_y = Component(id="out_y", kind="output", name="Y", ports=[Port(id="out_y.in", name="in", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_and_gate",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="AND Gate",
        components=[in_a, in_b, and1, out_y],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="and1", port_id="and1.a")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_b", port_id="in_b.out"), target=ConnectionEndpoint(component_id="and1", port_id="and1.b")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="and1", port_id="and1.y"), target=ConnectionEndpoint(component_id="out_y", port_id="out_y.in")),
        ],
        root_component_ids=["in_a", "in_b", "and1", "out_y"],
        provenance=_provenance(),
    )


def two_component_connection_document() -> IRDocument:
    """The smallest possible non-trivial IR: two buffers wired together."""

    buf1 = Component(id="buf1", kind="BUFFER", name="BUF1", ports=[Port(id="buf1.y", name="y", direction=PortDirection.OUTPUT, width=1)])
    buf2 = Component(id="buf2", kind="BUFFER", name="BUF2", ports=[Port(id="buf2.a", name="a", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_two_component",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Two Component Connection",
        components=[buf1, buf2],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="buf1", port_id="buf1.y"), target=ConnectionEndpoint(component_id="buf2", port_id="buf2.a")),
        ],
        root_component_ids=["buf1", "buf2"],
        provenance=_provenance(),
    )


def hierarchical_module_document() -> IRDocument:
    """A MODULE container with one internal AND gate, demonstrating boundary
    ports: the module's own input ports source signals DOWN into the child,
    and the child's output drives the module's own output port UP."""

    top = Component(
        id="top", kind="MODULE", name="Top",
        ports=[
            Port(id="top.in_a", name="in_a", direction=PortDirection.INPUT, width=1),
            Port(id="top.in_b", name="in_b", direction=PortDirection.INPUT, width=1),
            Port(id="top.out_y", name="out_y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    and1 = Component(
        id="and1", kind="AND", name="AND1", parent_id="top",
        ports=[
            Port(id="and1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="and1.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="and1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )

    return IRDocument(
        id="doc_hierarchical_module",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Hierarchical Module",
        components=[top, and1],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="top", port_id="top.in_a"), target=ConnectionEndpoint(component_id="and1", port_id="and1.a")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="top", port_id="top.in_b"), target=ConnectionEndpoint(component_id="and1", port_id="and1.b")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="and1", port_id="and1.y"), target=ConnectionEndpoint(component_id="top", port_id="top.out_y")),
        ],
        root_component_ids=["top"],
        provenance=_provenance(),
    )


def multi_bit_connection_document() -> IRDocument:
    """A 4-bit bus wired between two registers, demonstrating bit_range on a
    connection endpoint."""

    reg_a = Component(id="reg_a", kind="REGISTER", name="Reg A", ports=[Port(id="reg_a.q", name="q", direction=PortDirection.OUTPUT, width=4)])
    reg_b = Component(id="reg_b", kind="REGISTER", name="Reg B", ports=[Port(id="reg_b.d", name="d", direction=PortDirection.INPUT, width=4)])

    return IRDocument(
        id="doc_multi_bit",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Multi-bit Connection",
        components=[reg_a, reg_b],
        connections=[
            Connection(
                id="conn_1",
                source=ConnectionEndpoint(component_id="reg_a", port_id="reg_a.q", bit_range=BitRange(msb=3, lsb=0)),
                target=ConnectionEndpoint(component_id="reg_b", port_id="reg_b.d", bit_range=BitRange(msb=3, lsb=0)),
            ),
        ],
        root_component_ids=["reg_a", "reg_b"],
        provenance=_provenance(),
    )


def mux_2to1_document() -> IRDocument:
    """A 2:1 multiplexer built from primitive gates only (input/output/
    AND/OR/NOT) - Y = (A AND NOT SEL) OR (B AND SEL). Every component kind
    used here is in the simulation engine's supported set, so this example
    is fully simulatable, unlike a real multi-bit adder which would need
    an unsupported XOR gate."""

    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_b = Component(id="in_b", kind="input", name="B", ports=[Port(id="in_b.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    in_sel = Component(id="in_sel", kind="input", name="SEL", ports=[Port(id="in_sel.out", name="out", direction=PortDirection.OUTPUT, width=1)])

    not_sel = Component(
        id="not_sel", kind="NOT", name="NOT_SEL",
        ports=[
            Port(id="not_sel.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="not_sel.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    and_a = Component(
        id="and_a", kind="AND", name="AND_A",
        ports=[
            Port(id="and_a.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="and_a.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="and_a.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    and_b = Component(
        id="and_b", kind="AND", name="AND_B",
        ports=[
            Port(id="and_b.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="and_b.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="and_b.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    or1 = Component(
        id="or1", kind="OR", name="OR1",
        ports=[
            Port(id="or1.a", name="a", direction=PortDirection.INPUT, width=1),
            Port(id="or1.b", name="b", direction=PortDirection.INPUT, width=1),
            Port(id="or1.y", name="y", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_y = Component(id="out_y", kind="output", name="Y", ports=[Port(id="out_y.in", name="in", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_mux_2to1",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="2:1 Multiplexer",
        components=[in_a, in_b, in_sel, not_sel, and_a, and_b, or1, out_y],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="and_a", port_id="and_a.a")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_sel", port_id="in_sel.out"), target=ConnectionEndpoint(component_id="not_sel", port_id="not_sel.a")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="not_sel", port_id="not_sel.y"), target=ConnectionEndpoint(component_id="and_a", port_id="and_a.b")),
            Connection(id="conn_4", source=ConnectionEndpoint(component_id="in_b", port_id="in_b.out"), target=ConnectionEndpoint(component_id="and_b", port_id="and_b.a")),
            Connection(id="conn_5", source=ConnectionEndpoint(component_id="in_sel", port_id="in_sel.out"), target=ConnectionEndpoint(component_id="and_b", port_id="and_b.b")),
            Connection(id="conn_6", source=ConnectionEndpoint(component_id="and_a", port_id="and_a.y"), target=ConnectionEndpoint(component_id="or1", port_id="or1.a")),
            Connection(id="conn_7", source=ConnectionEndpoint(component_id="and_b", port_id="and_b.y"), target=ConnectionEndpoint(component_id="or1", port_id="or1.b")),
            Connection(id="conn_8", source=ConnectionEndpoint(component_id="or1", port_id="or1.y"), target=ConnectionEndpoint(component_id="out_y", port_id="out_y.in")),
        ],
        root_component_ids=["in_a", "in_b", "in_sel", "not_sel", "and_a", "and_b", "or1", "out_y"],
        provenance=_provenance(),
    )


def dff_document() -> IRDocument:
    """A single real D flip-flop: D driven by an input, CLK driven by a
    dedicated clock input, Q driving an output. Step 21 follow-up: the
    first real sequential (non-combinational) example document."""

    in_d = Component(
        id="in_d", kind="input", name="D_IN",
        ports=[Port(id="in_d.out", name="out", direction=PortDirection.OUTPUT, width=1)],
    )
    in_clk = Component(
        id="in_clk", kind="input", name="CLK_IN",
        ports=[Port(id="in_clk.out", name="out", direction=PortDirection.OUTPUT, width=1, type="clock")],
    )
    dff1 = Component(
        id="dff1", kind="DFF", name="DFF1",
        ports=[
            Port(id="dff1.d", name="d", direction=PortDirection.INPUT, width=1),
            Port(id="dff1.clk", name="clk", direction=PortDirection.INPUT, width=1, type="clock"),
            Port(id="dff1.q", name="q", direction=PortDirection.OUTPUT, width=1),
        ],
    )
    out_q = Component(
        id="out_q", kind="output", name="Q_OUT",
        ports=[Port(id="out_q.in", name="in", direction=PortDirection.INPUT, width=1)],
    )

    return IRDocument(
        id="doc_dff",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="D Flip-Flop",
        components=[in_d, in_clk, dff1, out_q],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_d", port_id="in_d.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.d")),
            Connection(id="conn_2", source=ConnectionEndpoint(component_id="in_clk", port_id="in_clk.out"), target=ConnectionEndpoint(component_id="dff1", port_id="dff1.clk")),
            Connection(id="conn_3", source=ConnectionEndpoint(component_id="dff1", port_id="dff1.q"), target=ConnectionEndpoint(component_id="out_q", port_id="out_q.in")),
        ],
        root_component_ids=["in_d", "in_clk", "dff1", "out_q"],
        provenance=_provenance(),
    )


ALL_EXAMPLES = {
    "simple_inverter": simple_inverter_document,
    "and_gate": and_gate_document,
    "two_component_connection": two_component_connection_document,
    "hierarchical_module": hierarchical_module_document,
    "multi_bit_connection": multi_bit_connection_document,
    "mux_2to1": mux_2to1_document,
    "dff": dff_document,
}
