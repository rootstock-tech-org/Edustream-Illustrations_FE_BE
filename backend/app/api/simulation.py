"""HTTP API for the behavioral simulation service (Step 6).

Pure transport/orchestration - contains zero gate-logic. The ONE real
simulation implementation remains app.domain.simulation.engine.simulate();
this module never re-validates the Canonical IR, never re-implements
guardrails, and never invents new circuit semantics.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.domain.simulation.models import SequentialSimulationResult, SimulationResult
from app.services.simulation_service import run_sequential_simulation, run_simulation

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class SimulationRequest(BaseModel):
    """The wire format for POST /api/simulation/simulate.

    `document` is intentionally a loose JSON object here - real Canonical
    IR validation (schema, guardrails, supported-kind/shape/width checks)
    happens entirely inside the simulation pipeline, never duplicated at
    this layer. A `document` that is well-formed JSON but not a valid
    Canonical IR still produces a normal HTTP 200 response with a
    structured `SimulationResult(is_valid=false)` - only a fundamentally
    malformed request body (e.g. `document` missing, or not a JSON
    object at all) produces the standard FastAPI 422 validation response.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]
    input_values: dict[str, Any] = Field(default_factory=dict)
    max_iterations: int | None = Field(
        default=None,
        gt=0,
        le=10_000,
        description="Optional override for the simulator's fixed-point iteration cap (default: 64).",
    )


@router.post(
    "/simulate",
    response_model=SimulationResult,
    summary="Run the behavioral simulator against a Canonical IR document.",
    description=(
        "Accepts a Canonical IR document plus input values keyed by real IR "
        "port ids (e.g. {\"in_a.out\": 1}). Supported logic values are 0, 1, "
        "and \"x\" (unknown/unresolved) - never silently defaulted. Supported "
        "component kinds are input/output/AND/OR/NOT only; anything else, any "
        "multi-bit (width != 1) port, or any bit_range slice produces a "
        "structured error rather than an invented result. The response is "
        "always the exact same SimulationResult shape the domain simulator "
        "produces - is_valid/errors/warnings/steps/final_signals - never a "
        "second, frontend-specific format."
    ),
)
def post_simulate(request: SimulationRequest) -> SimulationResult:
    return run_simulation(request.document, request.input_values, request.max_iterations)


class SequentialSimulationRequest(BaseModel):
    """The wire format for POST /api/simulation/simulate-sequential (Step
    21 follow-up #2: real behavioral simulation with time-stepping and
    clock support for DFF).

    `document` is a loose JSON object for the same reason as
    `SimulationRequest.document` - real validation happens entirely
    inside `simulate_sequential()`. `stimulus` maps a port id to an
    ordered list of `[timestep, value]` pairs (JSON has no tuple type);
    a port's value at timestep t is the value from the last event at or
    before t, holding steady between events and defaulting to unknown
    ("x") before its first event.
    """

    model_config = ConfigDict(extra="forbid")

    document: dict[str, Any]
    stimulus: dict[str, list[list[Any]]] = Field(default_factory=dict)
    num_timesteps: int = Field(gt=0, le=10_000)
    max_iterations: int | None = Field(
        default=None,
        gt=0,
        le=10_000,
        description="Optional override for the per-timestep fixed-point iteration cap (default: 64).",
    )


@router.post(
    "/simulate-sequential",
    response_model=SequentialSimulationResult,
    summary="Run the real time-stepped, clock-edge-aware behavioral simulator (supports DFF).",
    description=(
        "Accepts a Canonical IR document plus an ordered, per-port stimulus "
        "and simulates `num_timesteps` discrete clock timesteps. Supported "
        "component kinds are input/output/AND/OR/NOT/DFF. A DFF's Q output "
        "updates only on a real observed 0 -> 1 rising edge of its named "
        "'clk' port between two consecutive timesteps (never on clk==1 with "
        "no prior low sample), and starts UNKNOWN (\"x\") before the first "
        "such edge - an honest 'no invented power-on/reset value' policy. "
        "The response's `timesteps` field is the full waveform history (one "
        "SimulationStep per timestep, every port's value at that timestep), "
        "not just the final state."
    ),
)
def post_simulate_sequential(request: SequentialSimulationRequest) -> SequentialSimulationResult:
    return run_sequential_simulation(request.document, request.stimulus, request.num_timesteps, request.max_iterations)
