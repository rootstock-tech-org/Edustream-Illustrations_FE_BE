"""Deterministic behavioral simulation models - downstream of the
Canonical IR, independent of app.domain.schematic. No suitable digital
signal-value type exists yet anywhere in app.domain.ir, so LogicValue is
the one genuinely new type this domain needs; everything else (port ids,
widths) reuses IR data directly rather than redefining it.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.simulation.errors import SimulationError


class LogicValue(str, Enum):
    """A single-bit, three-valued digital signal. UNKNOWN is a first-class
    value - never silently coerced to 0."""

    ZERO = "0"
    ONE = "1"
    UNKNOWN = "x"


class SimulationSignal(BaseModel):
    """The value carried on one IR port at one simulation step / at the
    final stable state. `source_port_id` traces back to exactly one
    Canonical IR Port."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_port_id: str
    value: LogicValue
    width: int


class SimulationStep(BaseModel):
    """One deterministic evaluation round."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    index: int
    signals: list[SimulationSignal] = Field(default_factory=list)
    changed_port_ids: list[str] = Field(default_factory=list)


class SimulationResult(BaseModel):
    """The deterministic outcome of simulate(). No simulated state is ever
    presented as valid when is_valid is False - errors are returned
    instead, never a partial/best-effort result."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[SimulationError] = Field(default_factory=list)
    warnings: list[SimulationError] = Field(default_factory=list)
    steps: list[SimulationStep] = Field(default_factory=list)
    final_signals: list[SimulationSignal] = Field(default_factory=list)


class SequentialSimulationResult(BaseModel):
    """The deterministic outcome of simulate_sequential() (Step 21
    follow-up #2: real behavioral simulation with time-stepping and clock
    support). Deliberately reuses `SimulationStep`/`SimulationSignal`/
    `SimulationError` unchanged rather than inventing a parallel
    waveform-frame type - one `SimulationStep` per simulated timestep
    (its `index` field means "timestep index" here, not "fixed-point
    iteration index"; both are simply "the Nth settled snapshot this
    call produced", so the existing type generalizes cleanly). No
    simulated state is ever presented as valid when is_valid is False."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[SimulationError] = Field(default_factory=list)
    warnings: list[SimulationError] = Field(default_factory=list)
    timesteps: list[SimulationStep] = Field(default_factory=list)
