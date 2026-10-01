import pytest
from pydantic import ValidationError

from app.domain.ir.models import PortDirection
from app.domain.physical.errors import PhysicalError
from app.domain.physical.models import (
    PhysicalBlock,
    PhysicalDocument,
    PhysicalEndpoint,
    PhysicalNet,
    PhysicalPin,
    PhysicalResult,
)


def test_physical_pin_is_frozen() -> None:
    pin = PhysicalPin(id="pin_a", source_port_id="a", name="a", direction=PortDirection.INPUT, x=0.0, y=0.0)
    with pytest.raises(ValidationError):
        pin.x = 1.0  # type: ignore[misc]


def test_physical_block_holds_pins_and_area() -> None:
    pin = PhysicalPin(id="pin_a", source_port_id="a", name="a", direction=PortDirection.INPUT, x=0.0, y=0.0)
    block = PhysicalBlock(id="phys_c1", source_component_id="c1", kind="AND", name="C1", x=0.0, y=0.0, width=40.0, height=40.0, area=1600.0, pins=[pin])
    assert block.pins == [pin]
    assert block.area == 1600.0


def test_physical_net_holds_endpoints() -> None:
    source = PhysicalEndpoint(block_id="phys_a", pin_id="pin_a", source_component_id="a", source_port_id="a.out")
    target = PhysicalEndpoint(block_id="phys_b", pin_id="pin_b", source_component_id="b", source_port_id="b.in")
    net = PhysicalNet(id="net_1", source_connection_id="conn_1", source=source, target=target)
    assert net.source_connection_id == "conn_1"


def test_physical_document_is_frozen() -> None:
    document = PhysicalDocument(source_document_id="doc_1", source_schema_version="1.0.0", die_width=0.0, die_height=0.0)
    with pytest.raises(ValidationError):
        document.die_width = 100.0  # type: ignore[misc]


def test_physical_result_defaults() -> None:
    result = PhysicalResult(is_valid=True)
    assert result.errors == []
    assert result.warnings == []
    assert result.physical is None


def test_physical_error_is_frozen() -> None:
    error = PhysicalError(code="X", message="m", path="p")
    with pytest.raises(ValidationError):
        error.code = "Y"  # type: ignore[misc]
