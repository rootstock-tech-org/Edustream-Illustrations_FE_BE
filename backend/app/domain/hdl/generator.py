"""generate_verilog(document) -> HdlGenerationResult

Deterministic, primitive-only Verilog HDL generation - Step 18's real
synthesis input. Only ever succeeds for documents built entirely from a
small, explicitly supported set of primitive kinds (input/output/AND/OR/
NOT/DFF) - any other kind is an honest, structured failure, never
fabricated HDL for an opaque/compound component (mux/adder/counter/etc.
have no real gate-level definition in this platform yet).

IDENTITY PRESERVATION - real Yosys behavior verified directly (not
assumed) before choosing this design: Verilog's BUILT-IN gate primitives
(`and`/`or`/`not`) are elaborated by Yosys's read_verilog frontend into
anonymous, auto-named internal cells (`hide_name: 1`, a file:line-derived
name) - neither the chosen instance name NOR a `(* attribute *)` attached
to that instantiation survives synthesis. A small, USER-DEFINED Verilog
submodule per (kind, input count, width) shape, instantiated by name,
does NOT have this problem - Yosys's `hierarchy`/`proc`/`opt` passes (no
`flatten`) preserve a submodule instance's chosen name exactly as the
real JSON cell key. This is therefore the mechanism used here: every
top-level Verilog port is named after its owning IR component's own id
(input/output kind components), and every gate is a named instance of a
tiny generated submodule, with the instance name equal to the IR
component id. A redundant `(* canonical_component_id = "..." *)`
attribute plus `(* keep *)` are also attached to each instance as
defense-in-depth against a future, more aggressive optimization pass -
but the PRIMARY, verified-working mechanism is the instance name itself.

DFF/REGISTER (Step 21 follow-up): a "DFF"-kind component is a real,
positive-edge-triggered D flip-flop/register (`always @(posedge clk)
q <= d;`), generated as its OWN named submodule shape - the SAME identity-
preservation mechanism as the combinational gate shapes above, so its
instance name survives synthesis identically (proven directly, see
tests/domain/hdl/test_generator.py). Only D/CLK/Q are modelled in this
pass - NO reset (sync or async) is generated, since this platform's
Canonical IR/guardrails/simulation layers have no reset semantics
modelled anywhere yet; adding fabricated reset behavior here would be
worse than not supporting it. `app.domain.guardrails.rules` validates a
DFF's exact required port shape (d/clk/q, correct directions, clk is a
1-bit scalar) BEFORE this function ever runs - the checks in this
function's DFF branch are defense-in-depth, not the primary gate.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.guardrails.validator import run_guardrails
from app.domain.hdl.errors import HdlError
from app.domain.ir.models import IRDocument, PortDirection, ResetPolarity, ResetSpec, ResetTiming

_SUPPORTED_KINDS = frozenset({"input", "output", "AND", "OR", "NOT", "DFF"})
_REDUCE_OPERATOR = {"AND": "&", "OR": "|"}

_IDENTIFIER_START_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
)
_IDENTIFIER_CHARS = _IDENTIFIER_START_CHARS | frozenset("0123456789")


@dataclass(frozen=True)
class HdlModule:
    """One generated Verilog module (plus its small gate-shape helper
    submodules) and the identity anchors real Yosys synthesis needs to
    stay traceable back to the canonical IR."""

    module_name: str
    source_document_id: str
    verilog: str
    top_level_ports: dict[str, str]
    gate_instance_ids: dict[str, str]


@dataclass(frozen=True)
class HdlGenerationResult:
    """The deterministic outcome of generate_verilog(). No partial/fake
    HdlModule is ever returned when success is False."""

    success: bool
    module: HdlModule | None = None
    message: str = ""
    errors: list[HdlError] = field(default_factory=list)
    failure_reason: str | None = None


def generate_verilog(document: IRDocument) -> HdlGenerationResult:
    guardrail_result = run_guardrails(document)
    if not guardrail_result.is_valid or guardrail_result.normalized_document is None:
        errors = [
            HdlError(code=issue.code, message=issue.message, path=issue.path)
            for issue in guardrail_result.errors
        ]
        return HdlGenerationResult(
            success=False,
            message="The Canonical IR failed guardrail validation.",
            errors=errors,
            failure_reason="INVALID_IR",
        )

    normalized = guardrail_result.normalized_document

    unsupported_kinds = sorted(
        {component.kind for component in normalized.components} - _SUPPORTED_KINDS
    )
    if unsupported_kinds:
        return HdlGenerationResult(
            success=False,
            message=(
                "This document cannot be synthesized yet: kind(s) "
                f"{', '.join(unsupported_kinds)} have no real gate-level HDL "
                "definition in this platform (only input/output/AND/OR/NOT/DFF "
                "do). Compound/opaque components are never given fabricated HDL."
            ),
            failure_reason="UNSUPPORTED_COMPONENT_KIND",
        )

    module_name = _sanitize_identifier(f"m_{normalized.id}")
    if module_name is None:
        return HdlGenerationResult(
            success=False,
            message=f"Document id '{normalized.id}' cannot be turned into a valid Verilog module name.",
            failure_reason="INVALID_IDENTIFIER",
        )

    identifiers: dict[str, str] = {}
    for component in normalized.components:
        identifier = _sanitize_identifier(component.id)
        if identifier is None:
            return HdlGenerationResult(
                success=False,
                message=f"Component id '{component.id}' cannot be turned into a valid Verilog identifier.",
                failure_reason="INVALID_IDENTIFIER",
            )
        identifiers[component.id] = identifier

    if len(set(identifiers.values())) != len(identifiers):
        return HdlGenerationResult(
            success=False,
            message="Two or more component ids sanitize to the same Verilog identifier - cannot generate unambiguous HDL.",
            failure_reason="INVALID_IDENTIFIER",
        )

    driver_by_target_port = _build_driver_map(normalized)

    net_name_by_port_id: dict[str, str] = {}
    top_level_ports: dict[str, str] = {}
    port_lines: list[str] = []
    wire_lines: list[str] = []

    # First pass: assign a net name to every port capable of DRIVING a
    # net - every "input" component's sole output port becomes a
    # top-level Verilog input port; every gate/DFF's output port becomes
    # an internal wire (a DFF has exactly one output port too, so this
    # generic branch already covers it - no DFF-specific change needed
    # here). This must happen before the second pass so any gate/DFF's
    # inputs can be resolved regardless of component id order.
    for component in normalized.components:
        identifier = identifiers[component.id]

        if component.kind == "input":
            output_port = next(
                port for port in component.ports if port.direction == PortDirection.OUTPUT
            )
            width_decl = "" if output_port.width == 1 else f"[{output_port.width - 1}:0] "
            port_lines.append(f"    input wire {width_decl}{identifier}")
            net_name_by_port_id[output_port.id] = identifier
            top_level_ports[identifier] = component.id
        elif component.kind == "output":
            continue  # resolved in the second pass, once its driver is known
        else:
            output_port = next(
                port for port in component.ports if port.direction == PortDirection.OUTPUT
            )
            net_name = f"{identifier}_y"
            width_decl = "" if output_port.width == 1 else f"[{output_port.width - 1}:0] "
            wire_lines.append(f"    wire {width_decl}{net_name};")
            net_name_by_port_id[output_port.id] = net_name

    body_lines: list[str] = []
    gate_instance_ids: dict[str, str] = {}
    gate_shape_defs: dict[str, str] = {}  # submodule name -> its Verilog definition

    # Second pass: resolve every driven (target-only) port's net name via
    # the connection graph, emit "output" top-level ports + assigns, and
    # emit gate/DFF instances (one named submodule instance each - see
    # module docstring for why a raw builtin `and`/`or`/`not` primitive
    # or an inline `always` block is deliberately never used).
    for component in normalized.components:
        identifier = identifiers[component.id]

        if component.kind == "input":
            continue

        if component.kind == "output":
            input_port = next(
                port for port in component.ports if port.direction == PortDirection.INPUT
            )
            driver_net = _resolve_driver_net(
                input_port.id, driver_by_target_port, net_name_by_port_id
            )
            if driver_net is None:
                return HdlGenerationResult(
                    success=False,
                    message=f"Port '{input_port.id}' on component '{component.id}' is not driven by any connection.",
                    failure_reason="UNDRIVEN_PORT",
                )
            width_decl = "" if input_port.width == 1 else f"[{input_port.width - 1}:0] "
            port_lines.append(f"    output wire {width_decl}{identifier}")
            top_level_ports[identifier] = component.id
            body_lines.append(f"    assign {identifier} = {driver_net};")
            continue

        if component.kind == "DFF":
            ports_by_name = {port.name: port for port in component.ports}
            d_port = ports_by_name.get("d")
            clk_port = ports_by_name.get("clk")
            q_port = next(
                (port for port in component.ports if port.direction == PortDirection.OUTPUT),
                None,
            )
            if d_port is None or clk_port is None or q_port is None:
                # Defense-in-depth only - app.domain.guardrails.rules
                # already rejects a malformed DFF shape before this
                # function is ever reached.
                return HdlGenerationResult(
                    success=False,
                    message=f"Component '{component.id}' is a DFF but is missing its required 'd'/'clk'/output port.",
                    failure_reason="INVALID_COMPONENT_SHAPE",
                )

            output_net = net_name_by_port_id[q_port.id]

            d_net = _resolve_driver_net(d_port.id, driver_by_target_port, net_name_by_port_id)
            if d_net is None:
                return HdlGenerationResult(
                    success=False,
                    message=f"Port '{d_port.id}' on component '{component.id}' is not driven by any connection.",
                    failure_reason="UNDRIVEN_PORT",
                )
            clk_net = _resolve_driver_net(clk_port.id, driver_by_target_port, net_name_by_port_id)
            if clk_net is None:
                return HdlGenerationResult(
                    success=False,
                    message=f"Port '{clk_port.id}' on component '{component.id}' is not driven by any connection.",
                    failure_reason="UNDRIVEN_PORT",
                )

            # Reset (Step 22): component.reset is the ONLY signal that a
            # DFF has reset semantics - never inferred from the presence
            # of a 'reset' port. app.domain.guardrails.rules.
            # check_dff_reset_shape already guarantees, before this
            # function ever runs, that a 'reset'-declaring component has
            # exactly one correctly-shaped 'reset' port; the branch below
            # is defense-in-depth only, matching the existing d/clk/q
            # pattern in this same function.
            reset_net: str | None = None
            if component.reset is not None:
                reset_port = ports_by_name.get("reset")
                if reset_port is None:
                    return HdlGenerationResult(
                        success=False,
                        message=f"Component '{component.id}' declares reset semantics but is missing its 'reset' port.",
                        failure_reason="INVALID_COMPONENT_SHAPE",
                    )
                reset_net = _resolve_driver_net(reset_port.id, driver_by_target_port, net_name_by_port_id)
                if reset_net is None:
                    return HdlGenerationResult(
                        success=False,
                        message=f"Port '{reset_port.id}' on component '{component.id}' is not driven by any connection.",
                        failure_reason="UNDRIVEN_PORT",
                    )

            shape_name, shape_def = _dff_shape(q_port.width, component.reset)
            gate_shape_defs.setdefault(shape_name, shape_def)

            attr = f'(* canonical_component_id = "{component.id}", keep *)'
            if reset_net is None:
                body_lines.append(
                    f"    {attr} {shape_name} {identifier} (.d({d_net}), .clk({clk_net}), .q({output_net}));"
                )
            else:
                body_lines.append(
                    f"    {attr} {shape_name} {identifier} "
                    f"(.d({d_net}), .clk({clk_net}), .reset({reset_net}), .q({output_net}));"
                )
            gate_instance_ids[component.id] = identifier
            continue

        # AND / OR / NOT gate.
        input_ports = sorted(
            (port for port in component.ports if port.direction == PortDirection.INPUT),
            key=lambda port: port.id,
        )
        output_port = next(
            port for port in component.ports if port.direction == PortDirection.OUTPUT
        )
        output_net = net_name_by_port_id[output_port.id]
        width = output_port.width

        operand_nets: list[str] = []
        for input_port in input_ports:
            driver_net = _resolve_driver_net(
                input_port.id, driver_by_target_port, net_name_by_port_id
            )
            if driver_net is None:
                return HdlGenerationResult(
                    success=False,
                    message=f"Port '{input_port.id}' on component '{component.id}' is not driven by any connection.",
                    failure_reason="UNDRIVEN_PORT",
                )
            operand_nets.append(driver_net)

        shape_name, shape_def = _gate_shape(component.kind, len(operand_nets), width)
        gate_shape_defs.setdefault(shape_name, shape_def)

        attr = f'(* canonical_component_id = "{component.id}", keep *)'
        port_connections = ", ".join(
            f".i{index}({net})" for index, net in enumerate(operand_nets)
        )
        body_lines.append(
            f"    {attr} {shape_name} {identifier} ({port_connections}, .y({output_net}));"
        )
        gate_instance_ids[component.id] = identifier

    top_module_verilog = _render_module(module_name, port_lines, wire_lines, body_lines)
    verilog = "\n".join(gate_shape_defs[name] for name in sorted(gate_shape_defs)) + (
        "\n" if gate_shape_defs else ""
    ) + top_module_verilog

    module = HdlModule(
        module_name=module_name,
        source_document_id=normalized.id,
        verilog=verilog,
        top_level_ports=top_level_ports,
        gate_instance_ids=gate_instance_ids,
    )
    return HdlGenerationResult(
        success=True, module=module, message=f"Generated Verilog module '{module_name}'."
    )


def _gate_shape(kind: str, num_inputs: int, width: int) -> tuple[str, str]:
    """Return (submodule_name, submodule_verilog_definition) for one
    (kind, input count, width) shape - generated once per distinct shape
    and reused by every component with that exact shape."""

    shape_name = f"_{kind}_{num_inputs}IN_{width}W"
    width_decl = "" if width == 1 else f"[{width - 1}:0] "

    input_ports = ", ".join(f"input {width_decl}i{index}" for index in range(num_inputs))

    if kind == "NOT":
        body = "  assign y = ~i0;"
    else:
        operator = _REDUCE_OPERATOR[kind]
        body = "  assign y = " + f" {operator} ".join(f"i{index}" for index in range(num_inputs)) + ";"

    definition = (
        f"module {shape_name} ({input_ports}, output {width_decl}y);\n"
        f"{body}\n"
        "endmodule\n"
    )
    return shape_name, definition


def _dff_shape(width: int, reset: ResetSpec | None) -> tuple[str, str]:
    """Return (submodule_name, submodule_verilog_definition) for a real
    D flip-flop/register of the given width, generated once per distinct
    (width, reset) shape and reused by every DFF component sharing that
    exact shape.

    `reset=None` produces EXACTLY the same shape name and Verilog this
    function has always produced (`_DFF_{width}W`, plain
    `always @(posedge clk) q <= d;`) - this is a strict backward-
    compatibility guarantee for every DFF that predates reset support.

    `reset` present produces one of four real, synthesizable reset
    shapes (sync/async x active-high/active-low). Reset always drives Q
    to 0 - no other reset VALUE is modelled (no reset-to-1, no reset-to-
    an-arbitrary-constant); this is a stated limitation, not an inferred
    default. Synchronous reset is checked INSIDE the clocked always
    block (only takes effect on a real clk edge, same as D capture);
    asynchronous reset is placed in the block's own event/sensitivity
    list (`posedge reset` / `negedge reset`), so it can force Q to 0
    immediately, independent of any clk edge - correct, standard
    Verilog semantics for each case, never faked via a comment or
    metadata-only annotation."""

    width_decl = "" if width == 1 else f"[{width - 1}:0] "

    if reset is None:
        shape_name = f"_DFF_{width}W"
        definition = (
            f"module {shape_name} (input {width_decl}d, input clk, output reg {width_decl}q);\n"
            "  always @(posedge clk) q <= d;\n"
            "endmodule\n"
        )
        return shape_name, definition

    polarity_suffix = "HIGH" if reset.polarity == ResetPolarity.ACTIVE_HIGH else "LOW"
    timing_suffix = "SYNC" if reset.timing == ResetTiming.SYNCHRONOUS else "ASYNC"
    shape_name = f"_DFF_{width}W_{timing_suffix}_{polarity_suffix}"

    reset_condition = "reset" if reset.polarity == ResetPolarity.ACTIVE_HIGH else "!reset"
    reset_zero_value = "1'b0" if width == 1 else f"{width}'b0"

    if reset.timing == ResetTiming.SYNCHRONOUS:
        sensitivity = "posedge clk"
    else:
        edge_keyword = "posedge" if reset.polarity == ResetPolarity.ACTIVE_HIGH else "negedge"
        sensitivity = f"posedge clk or {edge_keyword} reset"

    definition = (
        f"module {shape_name} (input {width_decl}d, input clk, input reset, output reg {width_decl}q);\n"
        f"  always @({sensitivity}) begin\n"
        f"    if ({reset_condition}) q <= {reset_zero_value};\n"
        "    else q <= d;\n"
        "  end\n"
        "endmodule\n"
    )
    return shape_name, definition


def _resolve_driver_net(
    target_port_id: str,
    driver_by_target_port: dict[str, str],
    net_name_by_port_id: dict[str, str],
) -> str | None:
    driver_port_id = driver_by_target_port.get(target_port_id)
    if driver_port_id is None:
        return None
    return net_name_by_port_id.get(driver_port_id)


def _render_module(
    module_name: str,
    port_lines: list[str],
    wire_lines: list[str],
    body_lines: list[str],
) -> str:
    lines = [f"module {module_name} (", ",\n".join(port_lines), ");", ""]
    if wire_lines:
        lines.extend(wire_lines)
        lines.append("")
    lines.extend(body_lines)
    lines.append("")
    lines.append("endmodule")
    lines.append("")
    return "\n".join(lines)


def _build_driver_map(document: IRDocument) -> dict[str, str]:
    driver_by_target_port: dict[str, str] = {}
    for connection in document.connections:
        driver_by_target_port[connection.target.port_id] = connection.source.port_id
    return driver_by_target_port


def _sanitize_identifier(raw: str) -> str | None:
    """Return a valid Verilog identifier derived from `raw` by replacing
    every character that isn't already alnum/underscore with an
    underscore - or None if the result wouldn't be a legal identifier
    (empty, or starting with a digit). Never silently truncates in a way
    that could collide two different ids - callers separately check for
    post-sanitization collisions across the whole document.
    """

    if not raw:
        return None
    sanitized = "".join(char if char in _IDENTIFIER_CHARS else "_" for char in raw)
    if sanitized[0] not in _IDENTIFIER_START_CHARS:
        return None
    return sanitized
