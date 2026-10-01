import pytest
from pydantic import ValidationError

from app.domain.simulation.errors import SimulationError
from app.domain.simulation.models import LogicValue, SimulationResult, SimulationSignal, SimulationStep


def test_logic_value_has_three_states() -> None:
    assert {v.value for v in LogicValue} == {"0", "1", "x"}


def test_simulation_error_is_frozen() -> None:
    error = SimulationError(code="X", message="m", path="p")
    with pytest.raises(ValidationError):
        error.code = "Y"  # type: ignore[misc]


def test_simulation_signal_is_frozen() -> None:
    signal = SimulationSignal(source_port_id="p1", value=LogicValue.ONE, width=1)
    with pytest.raises(ValidationError):
        signal.value = LogicValue.ZERO  # type: ignore[misc]


def test_simulation_step_is_frozen() -> None:
    step = SimulationStep(index=0)
    with pytest.raises(ValidationError):
        step.index = 1  # type: ignore[misc]


def test_simulation_result_is_frozen_with_defaults() -> None:
    result = SimulationResult(is_valid=True)
    assert result.errors == []
    assert result.warnings == []
    assert result.steps == []
    assert result.final_signals == []
    with pytest.raises(ValidationError):
        result.is_valid = False  # type: ignore[misc]
