"""simulate_sequential(document, stimulus, num_timesteps) -> SequentialSimulationResult
- Step 21 follow-up #2's single public entry point for real,
time-stepped, clock-edge-aware behavioral simulation of DFFs.

Deliberately a SEPARATE entry point from simulate() (Step 5/6's purely
combinational simulator), not a mode flag on it: simulate() must keep
its existing all-or-nothing "any DFF is UNSUPPORTED_COMPONENT_KIND"
behavior unchanged (still verified by
test_dff_document_is_honestly_unsupported_not_a_fabricated_result), and
mixing "instantaneous combinational settle" with "ordered clocked
timesteps" into one function's contract would make both harder to
reason about. Instead, this module reuses engine.py's actual
gate-evaluation primitives (_compute_next_round, _evaluate_component via
it, _build_driver_map, _build_step, _coerce_logic_value, _check_widths)
directly, adding only what real sequential simulation genuinely needs:
per-timestep stimulus resolution, DFF rising-edge detection, and
persistent per-DFF state carried across timesteps.

Supported component kinds: input/output/AND/OR/NOT (identical to
engine.py) plus DFF. Guardrails (including the Step 21 follow-up's
`check_dff_port_shape` ERROR-level check) are run first, exactly like
simulate() - a DFF with a missing/duplicate/mis-widthed d/clk/q port is
already rejected there, before this module's own DFF-identification code
ever runs.

Clock and initial-state policy (explicit, deliberate choices - see
docs/architecture.md for the full rationale):
  - A DFF's clock-carrying input port is identified BY NAME ("clk"), the
    same convention already used by the HDL generator and guardrails
    for this exact component kind - never inferred from `Port.type`.
  - Only a real, OBSERVED 0 -> 1 transition between two consecutive
    simulated timesteps counts as a rising edge. A clk value of 1 at
    timestep 0 (with no prior sample at all) is NOT a rising edge -
    there is nothing to have transitioned FROM yet.
  - Q's value before the first observed rising edge is
    LogicValue.UNKNOWN ("x"), never a guessed/invented 0. Real hardware
    provides no defined power-on register value without an explicit
    reset network, which this platform does not model; UNKNOWN is
    already a first-class value in this exact simulator (see
    simulation/models.py), so this is the smallest honest extension of
    the existing signal model - not a new concept.
  - D is captured using the value it settles to WITHIN the SAME
    timestep as the detected rising edge (matching common
    discrete-timestep waveform conventions - Q visibly updates starting
    at the same timestep index the edge occurred on, not one timestep
    later). The edge-detecting settle pass uses Q's PRE-edge (held)
    value for that same timestep, exactly matching real synchronous
    hardware where D may combinationally depend on Q itself (e.g. a
    toggle flip-flop wired D = NOT Q). A second settle pass then
    re-propagates the POST-edge Q value through any downstream
    combinational logic, so a component driven by Q sees a consistent,
    fully-settled value at that same recorded timestep.
"""

from __future__ import annotations

from typing import NamedTuple

from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.models import IRDocument, ResetPolarity, ResetTiming
from app.domain.simulation.engine import (
    DEFAULT_MAX_ITERATIONS,
    InputValue,
    _build_driver_map,
    _build_step,
    _check_widths,
    _coerce_logic_value,
    _compute_next_round,
    _from_guardrail_issue,
)
from app.domain.simulation.engine import _SUPPORTED_KINDS as _COMBINATIONAL_SUPPORTED_KINDS
from app.domain.simulation.errors import SimulationError
from app.domain.simulation.models import LogicValue, SequentialSimulationResult, SimulationStep

_SEQUENTIAL_SUPPORTED_KINDS = _COMBINATIONAL_SUPPORTED_KINDS | {"DFF"}

Stimulus = dict[str, list[tuple[int, InputValue]]]


class _DffSpec(NamedTuple):
    component_id: str
    d_port_id: str
    clk_port_id: str
    q_port_id: str
    reset_port_id: str | None = None
    reset_polarity: ResetPolarity | None = None
    reset_timing: ResetTiming | None = None


def simulate_sequential(
    document: IRDocument,
    stimulus: Stimulus | None = None,
    num_timesteps: int = 1,
    *,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
) -> SequentialSimulationResult:
    """Validate+normalize via guardrails, then deterministically evaluate
    the circuit over `num_timesteps` discrete, ordered clock timesteps
    (0..num_timesteps-1), applying real rising-edge-triggered state
    semantics to every supported DFF. Never raises for expected
    invalid-input cases - always returns a structured
    SequentialSimulationResult.

    `stimulus` maps an input port id to an ordered list of
    (timestep, value) events; a port's value at timestep t is the value
    from the last event at or before t, holding steady between events
    and defaulting to LogicValue.UNKNOWN before its first event (or if
    never specified at all) - the same "UNKNOWN is honest, never
    silently coerced" philosophy simulate() already uses for
    unspecified inputs, just extended over time.
    """

    stimulus = stimulus or {}

    guardrail_result = run_guardrails(document)
    warnings = [_from_guardrail_issue(issue) for issue in guardrail_result.warnings]

    if not guardrail_result.is_valid or guardrail_result.normalized_document is None:
        errors = [_from_guardrail_issue(issue) for issue in guardrail_result.errors]
        return SequentialSimulationResult(is_valid=False, errors=errors, warnings=warnings, timesteps=[])

    normalized = guardrail_result.normalized_document

    if num_timesteps < 1:
        return SequentialSimulationResult(
            is_valid=False,
            errors=[
                SimulationError(
                    code="INVALID_TIMESTEP_COUNT",
                    message="num_timesteps must be at least 1.",
                    path="num_timesteps",
                )
            ],
            warnings=warnings,
            timesteps=[],
        )

    normalized_stimulus, stimulus_errors = _normalize_stimulus(stimulus, num_timesteps)
    if stimulus_errors:
        return SequentialSimulationResult(is_valid=False, errors=stimulus_errors, warnings=warnings, timesteps=[])

    kind_errors = _check_sequential_supported_kinds(normalized)
    if kind_errors:
        return SequentialSimulationResult(is_valid=False, errors=kind_errors, warnings=warnings, timesteps=[])

    width_errors = _check_widths(normalized)
    if width_errors:
        return SequentialSimulationResult(is_valid=False, errors=width_errors, warnings=warnings, timesteps=[])

    dff_specs, shape_errors = _extract_dff_specs(normalized)
    if shape_errors:
        return SequentialSimulationResult(is_valid=False, errors=shape_errors, warnings=warnings, timesteps=[])

    return _run_timesteps(normalized, normalized_stimulus, dff_specs, num_timesteps, warnings, max_iterations)


def _normalize_stimulus(
    stimulus: Stimulus, num_timesteps: int
) -> tuple[dict[str, dict[int, LogicValue]], list[SimulationError]]:
    """Validate and coerce the raw stimulus into port_id -> {timestep:
    value}. Each event's timestep must be an int in [0, num_timesteps);
    each value must be a valid LogicValue-coercible value (reusing
    engine._coerce_logic_value, the exact same coercion simulate() uses
    for its own input_values); a port must not specify the same
    timestep twice (ambiguous - rejected rather than silently picking
    one)."""

    normalized: dict[str, dict[int, LogicValue]] = {}
    errors: list[SimulationError] = []

    for port_id in sorted(stimulus):
        by_timestep: dict[int, LogicValue] = {}
        path = f"stimulus.{port_id}"
        for timestep, raw_value in stimulus[port_id]:
            if isinstance(timestep, bool) or not isinstance(timestep, int) or timestep < 0 or timestep >= num_timesteps:
                errors.append(
                    SimulationError(
                        code="INVALID_STIMULUS_TIMESTEP",
                        message=(
                            f"Stimulus event for port '{port_id}' has timestep {timestep!r}, "
                            f"which is not an integer in [0, {num_timesteps})."
                        ),
                        path=path,
                    )
                )
                continue
            if timestep in by_timestep:
                errors.append(
                    SimulationError(
                        code="DUPLICATE_STIMULUS_TIMESTEP",
                        message=f"Stimulus for port '{port_id}' specifies timestep {timestep} more than once.",
                        path=path,
                    )
                )
                continue
            value = _coerce_logic_value(raw_value)
            if value is None:
                errors.append(
                    SimulationError(
                        code="INVALID_INPUT_VALUE",
                        message=(
                            f"Value {raw_value!r} supplied for port '{port_id}' at timestep {timestep} "
                            "is not a valid logic value (expected 0, 1, 'x', or LogicValue)."
                        ),
                        path=path,
                    )
                )
                continue
            by_timestep[timestep] = value
        normalized[port_id] = by_timestep

    return normalized, errors


def _check_sequential_supported_kinds(document: IRDocument) -> list[SimulationError]:
    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        if component.kind not in _SEQUENTIAL_SUPPORTED_KINDS:
            errors.append(
                SimulationError(
                    code="UNSUPPORTED_COMPONENT_KIND",
                    message=(
                        f"Component '{component.id}' has kind '{component.kind}', "
                        "which this sequential simulator does not support."
                    ),
                    path=f"components.{component.id}.kind",
                )
            )
    return errors


def _extract_dff_specs(document: IRDocument) -> tuple[list[_DffSpec], list[SimulationError]]:
    """Identify each DFF component's d/clk/q ports by name (matching the
    HDL generator's and guardrails' own convention for this component
    kind). Guardrails' `check_dff_port_shape` (Step 21 follow-up) already
    rejects any DFF missing one of these named ports before
    `normalized_document` is ever produced, so the error branch here is
    defense-in-depth only and should be unreachable in practice."""

    specs: list[_DffSpec] = []
    errors: list[SimulationError] = []
    for component in sorted(document.components, key=lambda component: component.id):
        if component.kind != "DFF":
            continue
        ports_by_name = {port.name: port for port in component.ports}
        d_port = ports_by_name.get("d")
        clk_port = ports_by_name.get("clk")
        q_port = ports_by_name.get("q")
        if d_port is None or clk_port is None or q_port is None:
            errors.append(
                SimulationError(
                    code="INVALID_DFF_SHAPE",
                    message=f"Component '{component.id}' (kind 'DFF') is missing a required d/clk/q port.",
                    path=f"components.{component.id}",
                )
            )
            continue

        # Reset (Step 22): component.reset is the ONLY signal a DFF has
        # reset semantics at all - never inferred from a 'reset' port's
        # mere presence. app.domain.guardrails.rules.check_dff_reset_shape
        # already guarantees, before simulate_sequential() ever reaches
        # here, that a reset-declaring component has exactly one
        # correctly-shaped 'reset' port; this branch is defense-in-depth
        # only, matching this function's own existing d/clk/q pattern.
        reset_port_id: str | None = None
        reset_polarity: ResetPolarity | None = None
        reset_timing: ResetTiming | None = None
        if component.reset is not None:
            reset_port = ports_by_name.get("reset")
            if reset_port is None:
                errors.append(
                    SimulationError(
                        code="INVALID_DFF_RESET_SHAPE",
                        message=(
                            f"Component '{component.id}' (kind 'DFF') declares reset "
                            "semantics but is missing its required 'reset' port."
                        ),
                        path=f"components.{component.id}",
                    )
                )
                continue
            reset_port_id = reset_port.id
            reset_polarity = component.reset.polarity
            reset_timing = component.reset.timing

        specs.append(
            _DffSpec(
                component_id=component.id,
                d_port_id=d_port.id,
                clk_port_id=clk_port.id,
                q_port_id=q_port.id,
                reset_port_id=reset_port_id,
                reset_polarity=reset_polarity,
                reset_timing=reset_timing,
            )
        )
    return specs, errors


def _seed_round(
    document: IRDocument,
    last_value_by_port: dict[str, LogicValue],
    dff_state: dict[str, LogicValue],
) -> dict[str, LogicValue]:
    """Build the initial per-port snapshot for one timestep's
    combinational settle: "input"-kind output ports take their currently
    held stimulus value, each DFF's q port takes its currently held
    sequential state, and everything else starts UNKNOWN (recomputed by
    the settle below)."""

    seed_values: dict[str, LogicValue] = {}
    for component in sorted(document.components, key=lambda component: component.id):
        for port in sorted(component.ports, key=lambda port: port.id):
            if component.kind == "input":
                seed_values[port.id] = last_value_by_port.get(port.id, LogicValue.UNKNOWN)
            elif port.id in dff_state:
                seed_values[port.id] = dff_state[port.id]
            else:
                seed_values[port.id] = LogicValue.UNKNOWN
    return seed_values


def _settle(
    document: IRDocument,
    driver_by_target_port: dict[str, str],
    seed_values: dict[str, LogicValue],
    max_iterations: int,
) -> dict[str, LogicValue] | None:
    """Iterate engine._compute_next_round (the exact same single-round
    gate-evaluation logic simulate() uses) to a stable fixed point.
    Returns the converged snapshot, or None if it does not converge
    within max_iterations (mirrors engine._run_fixed_point's own
    convergence bound and NON_CONVERGENT_SIMULATION semantics)."""

    values = seed_values
    for _ in range(max_iterations):
        new_values = _compute_next_round(document, driver_by_target_port, values)
        if new_values == values:
            return new_values
        values = new_values
    return None


def _run_timesteps(
    document: IRDocument,
    normalized_stimulus: dict[str, dict[int, LogicValue]],
    dff_specs: list[_DffSpec],
    num_timesteps: int,
    warnings: list[SimulationError],
    max_iterations: int,
) -> SequentialSimulationResult:
    driver_by_target_port = _build_driver_map(document)

    input_port_ids = sorted(
        port.id for component in document.components if component.kind == "input" for port in component.ports
    )
    last_value_by_port: dict[str, LogicValue] = {port_id: LogicValue.UNKNOWN for port_id in input_port_ids}

    # Initial policy: every DFF's Q starts UNKNOWN (no invented
    # power-on/reset value - see module docstring); every DFF's clk has
    # no prior sample yet, so timestep 0 can never itself be treated as
    # a rising edge.
    dff_state: dict[str, LogicValue] = {spec.q_port_id: LogicValue.UNKNOWN for spec in dff_specs}
    previous_clk_value: dict[str, LogicValue | None] = {spec.clk_port_id: None for spec in dff_specs}

    timesteps: list[SimulationStep] = []
    previous_recorded_values: dict[str, LogicValue] = {}

    for timestep in range(num_timesteps):
        for port_id in input_port_ids:
            events = normalized_stimulus.get(port_id, {})
            if timestep in events:
                last_value_by_port[port_id] = events[timestep]

        # Pass 1: settle combinational logic using each DFF's PRE-edge
        # (held) Q value, exactly matching real hardware semantics for
        # any D that combinationally depends on Q.
        seed_values = _seed_round(document, last_value_by_port, dff_state)
        settled = _settle(document, driver_by_target_port, seed_values, max_iterations)
        if settled is None:
            return _non_convergent_result(warnings, timesteps, timestep)

        for spec in dff_specs:
            current_clk = settled.get(spec.clk_port_id, LogicValue.UNKNOWN)
            prior_clk = previous_clk_value[spec.clk_port_id]
            is_rising_edge = prior_clk == LogicValue.ZERO and current_clk == LogicValue.ONE

            # Reset (Step 22). A reset with an UNKNOWN ("x") value is
            # never treated as active - the same "UNKNOWN is honest,
            # never silently coerced" policy this whole simulator uses
            # elsewhere; an undriven/unknown reset must never be
            # guessed into forcing a real state change.
            reset_active = False
            if spec.reset_port_id is not None:
                reset_value = settled.get(spec.reset_port_id, LogicValue.UNKNOWN)
                if spec.reset_polarity == ResetPolarity.ACTIVE_HIGH:
                    reset_active = reset_value == LogicValue.ONE
                elif spec.reset_polarity == ResetPolarity.ACTIVE_LOW:
                    reset_active = reset_value == LogicValue.ZERO

            is_async_reset = spec.reset_timing == ResetTiming.ASYNCHRONOUS
            is_sync_reset = spec.reset_timing == ResetTiming.SYNCHRONOUS

            if is_async_reset and reset_active:
                # Level-sensitive: forces Q to 0 the instant reset is
                # asserted, independent of any clk edge, and holds at 0
                # for as long as reset stays asserted - real async-reset
                # hardware behavior, not just an edge-triggered event.
                dff_state[spec.q_port_id] = LogicValue.ZERO
            elif is_rising_edge:
                if is_sync_reset and reset_active:
                    # Synchronous reset only ever takes effect ON a real
                    # rising clk edge, exactly like D capture - it is
                    # checked here, not outside this edge branch.
                    dff_state[spec.q_port_id] = LogicValue.ZERO
                else:
                    dff_state[spec.q_port_id] = settled.get(spec.d_port_id, LogicValue.UNKNOWN)
            # else: no rising edge and no active async reset this
            # timestep - Q holds its previously latched value unchanged
            # (dff_state is simply left untouched here).

            previous_clk_value[spec.clk_port_id] = current_clk

        # Pass 2: re-settle with each DFF's POST-edge Q value, so any
        # downstream combinational logic driven by Q is recorded
        # consistently at this same timestep.
        final_seed = dict(settled)
        for spec in dff_specs:
            final_seed[spec.q_port_id] = dff_state[spec.q_port_id]
        final_settled = _settle(document, driver_by_target_port, final_seed, max_iterations)
        if final_settled is None:
            return _non_convergent_result(warnings, timesteps, timestep)

        changed_port_ids = sorted(
            port_id
            for port_id, value in final_settled.items()
            if previous_recorded_values.get(port_id, LogicValue.UNKNOWN) != value
        )
        timesteps.append(_build_step(timestep, document, final_settled, changed_port_ids))
        previous_recorded_values = final_settled

    return SequentialSimulationResult(is_valid=True, errors=[], warnings=warnings, timesteps=timesteps)


def _non_convergent_result(
    warnings: list[SimulationError], timesteps: list[SimulationStep], timestep: int
) -> SequentialSimulationResult:
    return SequentialSimulationResult(
        is_valid=False,
        errors=[
            SimulationError(
                code="NON_CONVERGENT_SIMULATION",
                message=f"Simulation did not reach a stable state at timestep {timestep}.",
                path=f"simulation.timestep_{timestep}",
            )
        ],
        warnings=warnings,
        timesteps=timesteps,
    )
