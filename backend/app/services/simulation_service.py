"""Thin application service for Step 6: orchestrates request-level IR
parsing and delegates ALL real work to the ONE existing behavioral
simulation implementation, app.domain.simulation.engine.simulate(). This
module intentionally contains zero gate/logic-evaluation code."""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.domain.ir.serialization import from_dict
from app.domain.simulation.engine import simulate
from app.domain.simulation.errors import SimulationError
from app.domain.simulation.models import SequentialSimulationResult, SimulationResult
from app.domain.simulation.sequential_engine import simulate_sequential


def run_simulation(
    document_data: dict[str, Any],
    input_values: dict[str, Any],
    max_iterations: int | None = None,
) -> SimulationResult:
    """Parse a raw IR document payload and run the existing simulator.

    A `document` that is well-formed JSON but not a valid Canonical IR
    document (e.g. missing required fields, wrong types) produces a
    structured `INVALID_IR_DOCUMENT` SimulationResult - never an
    unhandled exception. This is the ONLY IR-parsing step; guardrail
    validation, supported-kind/shape/width checks, and logic evaluation
    all remain exclusively inside `simulate()` - never duplicated here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return SimulationResult(
            is_valid=False,
            errors=[SimulationError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    if max_iterations is None:
        return simulate(document, input_values)
    return simulate(document, input_values, max_iterations=max_iterations)


def run_sequential_simulation(
    document_data: dict[str, Any],
    stimulus: dict[str, list[list[Any]]],
    num_timesteps: int,
    max_iterations: int | None = None,
) -> SequentialSimulationResult:
    """Parse a raw IR document payload and run the real time-stepped,
    clock-edge-aware behavioral simulator (Step 21 follow-up #2). Mirrors
    `run_simulation`'s exact IR-parsing tolerance - a well-formed-JSON-
    but-invalid-Canonical-IR `document` produces a structured
    `INVALID_IR_DOCUMENT` SequentialSimulationResult, never an unhandled
    exception. `stimulus` maps a port id to an ordered list of
    `[timestep, value]` pairs (JSON has no tuple type - converted to
    `(timestep, value)` tuples here, the exact shape
    `simulate_sequential()` expects); all further validation (timestep
    range, duplicate timesteps, logic-value coercion, supported kinds,
    DFF shape) remains exclusively inside `simulate_sequential()` - never
    duplicated here.
    """

    try:
        document = from_dict(document_data)
    except ValidationError as exc:
        return SequentialSimulationResult(
            is_valid=False,
            errors=[SimulationError(code="INVALID_IR_DOCUMENT", message=str(exc), path="document")],
        )

    try:
        normalized_stimulus = {
            port_id: [(event[0], event[1]) for event in events] for port_id, events in stimulus.items()
        }
    except (IndexError, TypeError, ValueError) as exc:
        return SequentialSimulationResult(
            is_valid=False,
            errors=[SimulationError(code="INVALID_STIMULUS_SHAPE", message=str(exc), path="stimulus")],
        )

    if max_iterations is None:
        return simulate_sequential(document, normalized_stimulus, num_timesteps)
    return simulate_sequential(document, normalized_stimulus, num_timesteps, max_iterations=max_iterations)
