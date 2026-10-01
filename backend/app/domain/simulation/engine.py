"""simulate(document, input_values) -> SimulationResult - the single
public entry point for Step 5.

Deterministic, three-valued (0/1/X) behavioral simulation of a small,
explicitly-supported set of combinational primitives (input/output/AND/
OR/NOT), downstream of the validated/normalized Canonical IR. Never
imports app.domain.schematic - fully independent of layout/coordinates.
Never re-implements Step 2/3 validation; safety is entirely delegated to
app.domain.guardrails.run_guardrails().

Why only input/output/AND/OR/NOT (not BUFFER/MODULE/REGISTER, even
though those kinds appear in app.domain.ir.examples): BUFFER's semantics
are NOT actually unambiguous in this repository's own example (the only
BUFFER fixture gives one instance an OUTPUT-only port and the other an
INPUT-only port - never both on the same component - so there is no
demonstrated "passthrough" behavior to safely reuse). MODULE has no
IR-defined boundary semantics at all. REGISTER would need clock
semantics nowhere specified. All three correctly produce
UNSUPPORTED_COMPONENT_KIND rather than a guessed behavior.
"""

from __future__ import annotations

from app.domain.guardrails.models import GuardrailIssue
from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.models import Component, IRDocument, PortDirection
from app.domain.simulation.errors import SimulationError
from app.domain.simulation.models import LogicValue, SimulationResult, SimulationSignal, SimulationStep

DEFAULT_MAX_ITERATIONS = 64

_SUPPORTED_KINDS = frozenset({"input", "output", "AND", "OR", "NOT"})

InputValue = LogicValue | int | str | bool


def simulate(
    document: IRDocument,
    input_values: dict[str, InputValue] | None = None,
    *,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
) -> SimulationResult:
    """Validate+normalize via guardrails, then deterministically evaluate
    the circuit to a stable fixed point. Never raises for expected
    invalid-input cases - always returns a structured SimulationResult.

    `max_iterations` bounds the synchronous fixed-point loop so a
    connection-graph feedback cycle can never hang the process. The
    currently-supported primitives (AND/OR/NOT over {0,1,X}) are a
    monotone extension of boolean logic, so any circuit built purely from
    them provably converges well within the default cap; the cap and the
    NON_CONVERGENT_SIMULATION error exist as a defensive safety net (and
    are exercised directly by tests via an artificially low override)
    rather than because a real supported circuit can trigger them today.
    """

    input_values = input_values or {}

    guardrail_result = run_guardrails(document)
    warnings = [_from_guardrail_issue(issue) for issue in guardrail_result.warnings]

    if not guardrail_result.is_valid or guardrail_result.normalized_document is None:
        errors = [_from_guardrail_issue(issue) for issue in guardrail_result.errors]
        return SimulationResult(is_valid=False, errors=errors, warnings=warnings, steps=[], final_signals=[])

    normalized = guardrail_result.normalized_document

    normalized_inputs, input_errors = _normalize_inputs(input_values)
    if input_errors:
        return SimulationResult(is_valid=False, errors=input_errors, warnings=warnings, steps=[], final_signals=[])

    kind_errors = _check_supported_kinds(normalized)
    if kind_errors:
        return SimulationResult(is_valid=False, errors=kind_errors, warnings=warnings, steps=[], final_signals=[])

    shape_errors = _check_component_shapes(normalized)
    if shape_errors:
        return SimulationResult(is_valid=False, errors=shape_errors, warnings=warnings, steps=[], final_signals=[])

    width_errors = _check_widths(normalized)
    if width_errors:
        return SimulationResult(is_valid=False, errors=width_errors, warnings=warnings, steps=[], final_signals=[])

    missing_errors = _check_required_inputs(normalized, normalized_inputs)
    if missing_errors:
        return SimulationResult(is_valid=False, errors=missing_errors, warnings=warnings, steps=[], final_signals=[])

    return _run_fixed_point(normalized, normalized_inputs, warnings, max_iterations)


def _run_fixed_point(
    document: IRDocument,
    normalized_inputs: dict[str, LogicValue],
    warnings: list[SimulationError],
    max_iterations: int,
) -> SimulationResult:
    driver_by_target_port = _build_driver_map(document)

    values: dict[str, LogicValue] = {}
    for component in sorted(document.components, key=lambda component: component.id):
        for port in sorted(component.ports, key=lambda port: port.id):
            values[port.id] = normalized_inputs.get(port.id, LogicValue.UNKNOWN)

    steps: list[SimulationStep] = []
    for iteration in range(max_iterations):
        new_values = _compute_next_round(document, driver_by_target_port, values)

        changed_port_ids = sorted(
            port_id for port_id, value in new_values.items() if values.get(port_id, LogicValue.UNKNOWN) != value
        )
        steps.append(_build_step(iteration, document, new_values, changed_port_ids))

        if not changed_port_ids:
            return SimulationResult(
                is_valid=True,
                errors=[],
                warnings=warnings,
                steps=steps,
                final_signals=_build_signals(document, new_values),
            )

        values = new_values

    return SimulationResult(
        is_valid=False,
        errors=[
            SimulationError(
                code="NON_CONVERGENT_SIMULATION",
                message=f"Simulation did not reach a stable state within {max_iterations} iteration(s).",
                path="simulation",
            )
        ],
        warnings=warnings,
        steps=steps,
        final_signals=[],
    )


def _compute_next_round(
    document: IRDocument,
    driver_by_target_port: dict[str, str],
    values: dict[str, LogicValue],
) -> dict[str, LogicValue]:
    """One synchronous (Jacobi-style) evaluation round: compute every
    component's output port value(s) from `values` (the previous round's
    fully-settled snapshot), then mirror every connection target's value
    from its (freshly computed) source - purely for accurate
    reporting/traceability; gate evaluation always reads through
    `driver_by_target_port` directly and never depends on this mirror.

    Extracted from the body of `_run_fixed_point` so that
    `app.domain.simulation.sequential_engine` can reuse the exact same
    single-round gate-evaluation semantics per timestep, without
    duplicating any gate logic.
    """

    new_values = dict(values)

    for component in sorted(document.components, key=lambda component: component.id):
        _evaluate_component(component, driver_by_target_port, values, new_values)

    for connection in sorted(document.connections, key=lambda connection: connection.id):
        new_values[connection.target.port_id] = new_values.get(connection.source.port_id, LogicValue.UNKNOWN)

    return new_values


def _evaluate_component(
    component: Component,
    driver_by_target_port: dict[str, str],
    current_values: dict[str, LogicValue],
    new_values: dict[str, LogicValue],
) -> None:
    """Compute this component's OUTPUT port value(s) for the round, from
    `current_values` (the previous round's fully-settled snapshot) only -
    never from `new_values`, so evaluation order within a round can never
    affect the result (a synchronous/Jacobi-style update)."""

    if component.kind == "input":
        return  # fixed by the caller-supplied input value; never recomputed

    if component.kind == "DFF":
        # A DFF's Q output is sequential state, not a combinational
        # function of its current-round inputs - within a single
        # timestep's fixed-point settle it is held fixed (exactly like
        # "input"), whatever value the caller (sequential_engine) seeded
        # it with. Real state updates happen only in
        # app.domain.simulation.sequential_engine, between timesteps, on
        # a detected clock rising edge - never here. `simulate()` (the
        # purely-combinational entry point) never lets a DFF-containing
        # document reach this function at all (still rejected earlier by
        # `_check_supported_kinds`, since "DFF" is not in
        # `_SUPPORTED_KINDS`); this branch exists solely for
        # sequential_engine's reuse of `_compute_next_round`.
        return

    if component.kind == "output":
        for port in sorted(component.ports, key=lambda port: port.id):
            new_values[port.id] = _driven_value(port.id, driver_by_target_port, current_values)
        return

    if component.kind == "NOT":
        input_port = next(port for port in component.ports if port.direction == PortDirection.INPUT)
        output_port = next(port for port in component.ports if port.direction == PortDirection.OUTPUT)
        operand = _driven_value(input_port.id, driver_by_target_port, current_values)
        new_values[output_port.id] = _logic_not(operand)
        return

    if component.kind in ("AND", "OR"):
        input_ports = sorted(
            (port for port in component.ports if port.direction == PortDirection.INPUT), key=lambda port: port.id
        )
        output_port = next(port for port in component.ports if port.direction == PortDirection.OUTPUT)
        operands = [_driven_value(port.id, driver_by_target_port, current_values) for port in input_ports]
        reducer = _logic_and if component.kind == "AND" else _logic_or
        result = operands[0]
        for operand in operands[1:]:
            result = reducer(result, operand)
        new_values[output_port.id] = result
        return

    # Unreachable: unsupported kinds are rejected by _check_supported_kinds
    # before this function is ever called.
    raise AssertionError(f"unreachable: unsupported kind '{component.kind}' reached _evaluate_component")


def _driven_value(
    port_id: str,
    driver_by_target_port: dict[str, str],
    current_values: dict[str, LogicValue],
) -> LogicValue:
    driver_port_id = driver_by_target_port.get(port_id)
    if driver_port_id is None:
        return LogicValue.UNKNOWN
    return current_values.get(driver_port_id, LogicValue.UNKNOWN)


def _logic_not(value: LogicValue) -> LogicValue:
    if value == LogicValue.ZERO:
        return LogicValue.ONE
    if value == LogicValue.ONE:
        return LogicValue.ZERO
    return LogicValue.UNKNOWN


def _logic_and(a: LogicValue, b: LogicValue) -> LogicValue:
    if a == LogicValue.ZERO or b == LogicValue.ZERO:
        return LogicValue.ZERO
    if a == LogicValue.ONE and b == LogicValue.ONE:
        return LogicValue.ONE
    return LogicValue.UNKNOWN


def _logic_or(a: LogicValue, b: LogicValue) -> LogicValue:
    if a == LogicValue.ONE or b == LogicValue.ONE:
        return LogicValue.ONE
    if a == LogicValue.ZERO and b == LogicValue.ZERO:
        return LogicValue.ZERO
    return LogicValue.UNKNOWN


def _build_driver_map(document: IRDocument) -> dict[str, str]:
    driver_by_target_port: dict[str, str] = {}
    for connection in sorted(document.connections, key=lambda connection: connection.id):
        driver_by_target_port[connection.target.port_id] = connection.source.port_id
    return driver_by_target_port


def _build_signals(document: IRDocument, values: dict[str, LogicValue]) -> list[SimulationSignal]:
    signals: list[SimulationSignal] = []
    for component in sorted(document.components, key=lambda component: component.id):
        for port in sorted(component.ports, key=lambda port: port.id):
            signals.append(
                SimulationSignal(source_port_id=port.id, value=values.get(port.id, LogicValue.UNKNOWN), width=port.width)
            )
    return signals


def _build_step(
    index: int,
    document: IRDocument,
    values: dict[str, LogicValue],
    changed_port_ids: list[str],
) -> SimulationStep:
    return SimulationStep(index=index, signals=_build_signals(document, values), changed_port_ids=changed_port_ids)


def _check_supported_kinds(document: IRDocument) -> list[SimulationError]:
    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        if component.kind not in _SUPPORTED_KINDS:
            errors.append(
                SimulationError(
                    code="UNSUPPORTED_COMPONENT_KIND",
                    message=f"Component '{component.id}' has kind '{component.kind}', which this simulator does not support.",
                    path=f"components.{component.id}.kind",
                )
            )
    return errors


def _check_component_shapes(document: IRDocument) -> list[SimulationError]:
    """Verify every supported-kind component actually has the port shape
    its evaluation logic assumes, so _evaluate_component can never raise
    StopIteration on a structurally-valid-but-oddly-shaped IR (Step 2/3
    have no notion of what ports a given `kind` string should have)."""

    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        input_ports = [port for port in component.ports if port.direction == PortDirection.INPUT]
        output_ports = [port for port in component.ports if port.direction == PortDirection.OUTPUT]
        path = f"components.{component.id}"

        if component.kind == "input" and not output_ports:
            errors.append(
                SimulationError(code="INVALID_COMPONENT_PORT_SHAPE", message=f"Component '{component.id}' (kind 'input') must have at least one OUTPUT port.", path=path)
            )
        elif component.kind == "output" and not input_ports:
            errors.append(
                SimulationError(code="INVALID_COMPONENT_PORT_SHAPE", message=f"Component '{component.id}' (kind 'output') must have at least one INPUT port.", path=path)
            )
        elif component.kind == "NOT" and (len(input_ports) != 1 or len(output_ports) != 1):
            errors.append(
                SimulationError(code="INVALID_COMPONENT_PORT_SHAPE", message=f"Component '{component.id}' (kind 'NOT') must have exactly one INPUT and one OUTPUT port.", path=path)
            )
        elif component.kind in ("AND", "OR") and (len(input_ports) < 1 or len(output_ports) != 1):
            errors.append(
                SimulationError(code="INVALID_COMPONENT_PORT_SHAPE", message=f"Component '{component.id}' (kind '{component.kind}') must have at least one INPUT port and exactly one OUTPUT port.", path=path)
            )
    return errors


def _check_widths(document: IRDocument) -> list[SimulationError]:
    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        for port in sorted(component.ports, key=lambda port: port.id):
            if port.width != 1:
                errors.append(
                    SimulationError(
                        code="UNSUPPORTED_WIDTH",
                        message=f"Port '{port.id}' has width {port.width} - this simulator only supports scalar (width=1) ports.",
                        path=f"components.{component.id}.ports.{port.id}",
                    )
                )
    for connection in sorted(document.connections, key=lambda connection: connection.id):
        for role, endpoint in (("source", connection.source), ("target", connection.target)):
            if endpoint.bit_range is not None:
                errors.append(
                    SimulationError(
                        code="UNSUPPORTED_BIT_RANGE",
                        message=f"Connection '{connection.id}' {role} has an explicit bit_range - this simulator does not support bit-range slicing.",
                        path=f"connections.{connection.id}.{role}",
                    )
                )
    return errors


def _check_required_inputs(document: IRDocument, normalized_inputs: dict[str, LogicValue]) -> list[SimulationError]:
    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        if component.kind != "input":
            continue
        for port in sorted(component.ports, key=lambda port: port.id):
            if port.id not in normalized_inputs:
                errors.append(
                    SimulationError(
                        code="MISSING_INPUT_VALUE",
                        message=f"No value supplied for input port '{port.id}'.",
                        path=f"components.{component.id}.ports.{port.id}",
                    )
                )
    return errors


def _normalize_inputs(input_values: dict[str, InputValue]) -> tuple[dict[str, LogicValue], list[SimulationError]]:
    normalized: dict[str, LogicValue] = {}
    errors: list[SimulationError] = []
    for port_id in sorted(input_values):
        raw = input_values[port_id]
        value = _coerce_logic_value(raw)
        if value is None:
            errors.append(
                SimulationError(
                    code="INVALID_INPUT_VALUE",
                    message=f"Value {raw!r} supplied for port '{port_id}' is not a valid logic value (expected 0, 1, 'x', or LogicValue).",
                    path=f"input_values.{port_id}",
                )
            )
            continue
        normalized[port_id] = value
    return normalized, errors


def _coerce_logic_value(raw: InputValue) -> LogicValue | None:
    if isinstance(raw, LogicValue):
        return raw
    if isinstance(raw, bool):
        return LogicValue.ONE if raw else LogicValue.ZERO
    if isinstance(raw, int):
        if raw == 0:
            return LogicValue.ZERO
        if raw == 1:
            return LogicValue.ONE
        return None
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered == "0":
            return LogicValue.ZERO
        if lowered == "1":
            return LogicValue.ONE
        if lowered == "x":
            return LogicValue.UNKNOWN
    return None


def _from_guardrail_issue(issue: GuardrailIssue) -> SimulationError:
    return SimulationError(code=issue.code, message=issue.message, path=issue.path)
