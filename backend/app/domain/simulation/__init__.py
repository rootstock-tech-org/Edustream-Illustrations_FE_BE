"""Behavioral simulation layer: a deterministic, traceable EXECUTION view
of the validated/normalized Canonical IR - never a second source of
truth, never dependent on schematic layout."""

from app.domain.simulation.engine import DEFAULT_MAX_ITERATIONS, simulate
from app.domain.simulation.errors import SimulationError
from app.domain.simulation.models import LogicValue, SimulationResult, SimulationSignal, SimulationStep

__all__ = [
    "DEFAULT_MAX_ITERATIONS",
    "simulate",
    "SimulationError",
    "LogicValue",
    "SimulationResult",
    "SimulationSignal",
    "SimulationStep",
]
