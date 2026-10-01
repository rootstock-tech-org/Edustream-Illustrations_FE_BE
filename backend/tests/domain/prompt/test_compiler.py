from app.domain.guardrails.validator import run_guardrails
from app.domain.hdl.generator import generate_verilog
from app.domain.prompt.compiler import compile_intent
from app.domain.prompt.intent import VLSIIntent
from app.domain.prompt.models import PromptFailureReason
from app.domain.simulation.engine import simulate


def _and_gate_intent() -> VLSIIntent:
    return VLSIIntent.model_validate({
        "circuit_name": "AND Gate",
        "components": [
            {"id": "in_a", "kind": "input", "name": "A"},
            {"id": "in_b", "kind": "input", "name": "B"},
            {"id": "and1", "kind": "AND", "name": "AND1"},
            {"id": "out_y", "kind": "output", "name": "Y"},
        ],
        "connections": [
            {"source_id": "in_a", "target_id": "and1", "target_port": "a"},
            {"source_id": "in_b", "target_id": "and1", "target_port": "b"},
            {"source_id": "and1", "target_id": "out_y"},
        ],
    })


def test_primitive_only_circuit_compiles_and_simulates() -> None:
    outcome = compile_intent(_and_gate_intent())

    assert outcome.success is True
    assert outcome.document is not None
    assert len(outcome.document.components) == 4
    assert len(outcome.document.connections) == 3
    assert outcome.document.provenance is not None
    assert outcome.document.provenance.source == "ai_generated"

    guardrail_result = run_guardrails(outcome.document)
    assert guardrail_result.is_valid is True

    result = simulate(outcome.document, {"in_a.out": 1, "in_b.out": 1})
    assert result.is_valid is True
    y_signal = next(s for s in result.final_signals if s.source_port_id == "out_y.in")
    assert y_signal.value.value == "1"


def test_compound_kind_with_explicit_ports_compiles_but_is_opaque() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "4-bit Adder",
        "components": [
            {"id": "in_a", "kind": "input", "name": "A", "width": 4},
            {"id": "in_b", "kind": "input", "name": "B", "width": 4},
            {
                "id": "adder",
                "kind": "adder",
                "name": "Ripple Carry Adder",
                "ports": [
                    {"name": "a", "direction": "input", "width": 4},
                    {"name": "b", "direction": "input", "width": 4},
                    {"name": "sum", "direction": "output", "width": 4},
                ],
            },
            {"id": "out_sum", "kind": "output", "name": "Sum", "width": 4},
        ],
        "connections": [
            {"source_id": "in_a", "target_id": "adder", "target_port": "a"},
            {"source_id": "in_b", "target_id": "adder", "target_port": "b"},
            {"source_id": "adder", "source_port": "sum", "target_id": "out_sum"},
        ],
    })

    outcome = compile_intent(intent)

    assert outcome.success is True
    assert outcome.document is not None
    adder_component = next(c for c in outcome.document.components if c.id == "adder")
    assert adder_component.kind == "adder"
    assert {p.name for p in adder_component.ports} == {"a", "b", "sum"}

    # Real, honest limitation: an opaque compound kind is not simulatable yet.
    result = simulate(outcome.document, {"in_a.out": 1, "in_b.out": 1})
    assert result.is_valid is False
    assert any(error.code == "UNSUPPORTED_COMPONENT_KIND" for error in result.errors)


def test_unknown_kind_without_explicit_ports_fails_honestly() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "Mystery",
        "components": [{"id": "x", "kind": "flux_capacitor", "name": "X"}],
        "connections": [],
    })

    outcome = compile_intent(intent)

    assert outcome.success is False
    assert outcome.document is None
    assert outcome.failure_reason == PromptFailureReason.UNSUPPORTED_COMPONENT_KIND
    assert "flux_capacitor" in outcome.message


def test_connection_to_unknown_component_fails_honestly() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "Broken",
        "components": [{"id": "in_a", "kind": "input", "name": "A"}],
        "connections": [{"source_id": "in_a", "target_id": "does_not_exist"}],
    })

    outcome = compile_intent(intent)

    assert outcome.success is False
    assert outcome.failure_reason == PromptFailureReason.INVALID_CONNECTION


def test_ambiguous_port_inference_fails_honestly() -> None:
    intent = VLSIIntent.model_validate({
        "circuit_name": "Ambiguous",
        "components": [
            {
                "id": "block",
                "kind": "custom",
                "name": "Block",
                "ports": [
                    {"name": "out1", "direction": "output"},
                    {"name": "out2", "direction": "output"},
                ],
            },
            {"id": "out_y", "kind": "output", "name": "Y"},
        ],
        "connections": [{"source_id": "block", "target_id": "out_y"}],  # source_port omitted, ambiguous
    })

    outcome = compile_intent(intent)

    assert outcome.success is False
    assert outcome.failure_reason == PromptFailureReason.INVALID_CONNECTION


def test_empty_components_fails_honestly() -> None:
    intent = VLSIIntent.model_validate({"circuit_name": "Empty", "components": [], "connections": []})

    outcome = compile_intent(intent)

    assert outcome.success is False
    assert outcome.failure_reason == PromptFailureReason.MALFORMED_INTENT


def _dff_intent_via_primitive_template() -> VLSIIntent:
    """"Create a D flip-flop" - no explicit ports, relying on the DFF
    primitive template (same style as the AND gate intent above)."""

    return VLSIIntent.model_validate({
        "circuit_name": "D Flip-Flop",
        "components": [
            {"id": "in_d", "kind": "input", "name": "D"},
            {"id": "in_clk", "kind": "input", "name": "CLK"},
            {"id": "dff1", "kind": "DFF", "name": "DFF1"},
            {"id": "out_q", "kind": "output", "name": "Q"},
        ],
        "connections": [
            {"source_id": "in_d", "target_id": "dff1", "target_port": "d"},
            {"source_id": "in_clk", "target_id": "dff1", "target_port": "clk"},
            {"source_id": "dff1", "source_port": "q", "target_id": "out_q"},
        ],
    })


def _dff_intent_via_explicit_ports() -> VLSIIntent:
    """"Make a register with D, Q and clock" - the SAME semantic circuit,
    but with explicit ports supplied instead of relying on the template -
    a different valid natural-language phrasing must still resolve to a
    structurally-equivalent canonical component."""

    return VLSIIntent.model_validate({
        "circuit_name": "1-bit Register",
        "components": [
            {"id": "in_d", "kind": "input", "name": "D"},
            {"id": "in_clk", "kind": "input", "name": "CLK"},
            {
                "id": "dff1", "kind": "DFF", "name": "DFF1",
                "ports": [
                    {"name": "d", "direction": "input", "width": 1},
                    {"name": "clk", "direction": "input", "width": 1},
                    {"name": "q", "direction": "output", "width": 1},
                ],
            },
            {"id": "out_q", "kind": "output", "name": "Q"},
        ],
        "connections": [
            {"source_id": "in_d", "target_id": "dff1", "target_port": "d"},
            {"source_id": "in_clk", "target_id": "dff1", "target_port": "clk"},
            {"source_id": "dff1", "source_port": "q", "target_id": "out_q"},
        ],
    })


def test_dff_via_primitive_template_compiles_generates_real_hdl_and_passes_guardrails() -> None:
    outcome = compile_intent(_dff_intent_via_primitive_template())

    assert outcome.success is True
    assert outcome.document is not None

    guardrail_result = run_guardrails(outcome.document)
    assert guardrail_result.is_valid is True

    dff1 = next(c for c in outcome.document.components if c.id == "dff1")
    assert dff1.kind == "DFF"
    assert {p.name for p in dff1.ports} == {"d", "clk", "q"}
    clk_port = next(p for p in dff1.ports if p.name == "clk")
    assert clk_port.width == 1

    hdl_result = generate_verilog(outcome.document)
    assert hdl_result.success is True
    assert hdl_result.module is not None
    assert "always @(posedge clk) q <= d;" in hdl_result.module.verilog


def test_different_valid_dff_descriptions_resolve_to_the_same_canonical_port_shape() -> None:
    """Two DIFFERENT valid ways of describing the same circuit (implicit
    primitive template vs explicit ports) must compile into
    STRUCTURALLY EQUIVALENT canonical components - proving the compiler
    doesn't hardcode one specific phrasing, per Step 21's own
    "different descriptions -> same canonical structure" requirement."""

    via_template = compile_intent(_dff_intent_via_primitive_template())
    via_explicit_ports = compile_intent(_dff_intent_via_explicit_ports())

    assert via_template.success is True
    assert via_explicit_ports.success is True

    dff_template = next(c for c in via_template.document.components if c.id == "dff1")
    dff_explicit = next(c for c in via_explicit_ports.document.components if c.id == "dff1")

    assert dff_template.kind == dff_explicit.kind == "DFF"
    template_shape = {(p.name, p.direction, p.width) for p in dff_template.ports}
    explicit_shape = {(p.name, p.direction, p.width) for p in dff_explicit.ports}
    assert template_shape == explicit_shape


def test_dff_clock_port_stays_one_bit_even_for_a_wide_register_request() -> None:
    """"Make an 8-bit register" - the data path (d/q) should honor the
    requested width, but clk must NEVER be widened alongside it (a clock
    is always a 1-bit scalar signal, never a "clock bus")."""

    intent = VLSIIntent.model_validate({
        "circuit_name": "8-bit Register",
        "components": [
            {"id": "in_d", "kind": "input", "name": "D", "width": 8},
            {"id": "in_clk", "kind": "input", "name": "CLK"},
            {"id": "reg1", "kind": "DFF", "name": "REG1", "width": 8},
            {"id": "out_q", "kind": "output", "name": "Q", "width": 8},
        ],
        "connections": [
            {"source_id": "in_d", "target_id": "reg1", "target_port": "d"},
            {"source_id": "in_clk", "target_id": "reg1", "target_port": "clk"},
            {"source_id": "reg1", "source_port": "q", "target_id": "out_q"},
        ],
    })

    outcome = compile_intent(intent)

    assert outcome.success is True
    reg1 = next(c for c in outcome.document.components if c.id == "reg1")
    ports_by_name = {p.name: p for p in reg1.ports}
    assert ports_by_name["d"].width == 8
    assert ports_by_name["q"].width == 8
    assert ports_by_name["clk"].width == 1
