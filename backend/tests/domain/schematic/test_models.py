import pytest
from pydantic import ValidationError

from app.domain.ir.models import PortDirection
from app.domain.schematic.errors import SchematicError
from app.domain.schematic.models import (
    RoutedPoint,
    SchematicComponent,
    SchematicDocument,
    SchematicEndpoint,
    SchematicPort,
    SchematicResult,
    SchematicWire,
)


def test_schematic_port_is_frozen() -> None:
    port = SchematicPort(id="sp_a", source_port_id="a", name="a", direction=PortDirection.INPUT, width=1, x=0.0, y=0.0)
    with pytest.raises(ValidationError):
        port.width = 2  # type: ignore[misc]


def test_schematic_component_holds_ports() -> None:
    port = SchematicPort(id="sp_a", source_port_id="a", name="a", direction=PortDirection.INPUT, width=1, x=0.0, y=0.0)
    component = SchematicComponent(
        id="sc_c1", source_component_id="c1", kind="AND", name="C1",
        x=0.0, y=0.0, width=140.0, height=80.0, ports=[port],
    )
    assert component.ports == [port]


def test_schematic_wire_holds_endpoints_and_points() -> None:
    source = SchematicEndpoint(component_id="sc_a", port_id="sp_a", source_component_id="a", source_port_id="a.out")
    target = SchematicEndpoint(component_id="sc_b", port_id="sp_b", source_component_id="b", source_port_id="b.in")
    wire = SchematicWire(id="sw_1", source_connection_id="conn_1", source=source, target=target, points=[RoutedPoint(x=0.0, y=0.0), RoutedPoint(x=10.0, y=0.0)])
    assert wire.source_connection_id == "conn_1"
    assert len(wire.points) == 2


def test_schematic_document_is_frozen() -> None:
    document = SchematicDocument(source_document_id="doc_1", source_schema_version="1.0.0")
    with pytest.raises(ValidationError):
        document.source_document_id = "doc_2"  # type: ignore[misc]


def test_schematic_result_defaults() -> None:
    result = SchematicResult(is_valid=True)
    assert result.errors == []
    assert result.warnings == []
    assert result.schematic is None


def test_schematic_error_is_frozen() -> None:
    error = SchematicError(code="X", message="m", path="p")
    with pytest.raises(ValidationError):
        error.code = "Y"  # type: ignore[misc]
