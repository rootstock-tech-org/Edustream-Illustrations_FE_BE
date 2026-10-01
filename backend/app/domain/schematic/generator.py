"""generate_schematic(document) -> SchematicResult - the single public
entry point for Step 4. Never re-implements Step 2/3 validation; safety
is entirely delegated to app.domain.guardrails.run_guardrails()."""

from __future__ import annotations

from app.domain.guardrails.models import GuardrailIssue
from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.models import IRDocument
from app.domain.schematic.errors import SchematicError
from app.domain.schematic.layout import compute_layout, compute_port_positions
from app.domain.schematic.models import (
    RoutedPoint,
    SchematicComponent,
    SchematicDocument,
    SchematicEndpoint,
    SchematicPort,
    SchematicResult,
    SchematicWire,
)


def generate_schematic(document: IRDocument) -> SchematicResult:
    """Validate+normalize via guardrails, then deterministically render a
    SchematicDocument. Returns a structured failure (schematic=None) -
    never a partial schematic - whenever the IR is not safe to consume."""

    guardrail_result = run_guardrails(document)
    warnings = [_from_guardrail_issue(issue) for issue in guardrail_result.warnings]

    if not guardrail_result.is_valid or guardrail_result.normalized_document is None:
        errors = [_from_guardrail_issue(issue) for issue in guardrail_result.errors]
        return SchematicResult(is_valid=False, errors=errors, warnings=warnings, schematic=None)

    schematic = _build_schematic(guardrail_result.normalized_document)

    return SchematicResult(is_valid=True, errors=[], warnings=warnings, schematic=schematic)


def _from_guardrail_issue(issue: GuardrailIssue) -> SchematicError:
    return SchematicError(code=issue.code, message=issue.message, path=issue.path)


def _build_schematic(document: IRDocument) -> SchematicDocument:
    placements = compute_layout(document)
    port_positions = compute_port_positions(document, placements)

    schematic_components: list[SchematicComponent] = []
    for component in sorted(document.components, key=lambda component: component.id):
        placement = placements[component.id]
        schematic_ports = [
            SchematicPort(
                id=f"sp_{port.id}",
                source_port_id=port.id,
                name=port.name,
                direction=port.direction,
                width=port.width,
                x=port_positions[port.id].x,
                y=port_positions[port.id].y,
            )
            for port in sorted(component.ports, key=lambda port: port.id)
        ]
        schematic_components.append(
            SchematicComponent(
                id=f"sc_{component.id}",
                source_component_id=component.id,
                kind=component.kind,
                name=component.name,
                x=placement.x,
                y=placement.y,
                width=placement.width,
                height=placement.height,
                ports=schematic_ports,
            )
        )

    schematic_wires: list[SchematicWire] = []
    for connection in sorted(document.connections, key=lambda connection: connection.id):
        source_position = port_positions[connection.source.port_id]
        target_position = port_positions[connection.target.port_id]
        schematic_wires.append(
            SchematicWire(
                id=f"sw_{connection.id}",
                source_connection_id=connection.id,
                source=SchematicEndpoint(
                    component_id=f"sc_{connection.source.component_id}",
                    port_id=f"sp_{connection.source.port_id}",
                    source_component_id=connection.source.component_id,
                    source_port_id=connection.source.port_id,
                    bit_range=connection.source.bit_range,
                ),
                target=SchematicEndpoint(
                    component_id=f"sc_{connection.target.component_id}",
                    port_id=f"sp_{connection.target.port_id}",
                    source_component_id=connection.target.component_id,
                    source_port_id=connection.target.port_id,
                    bit_range=connection.target.bit_range,
                ),
                points=[
                    RoutedPoint(x=source_position.x, y=source_position.y),
                    RoutedPoint(x=target_position.x, y=target_position.y),
                ],
            )
        )

    return SchematicDocument(
        source_document_id=document.id,
        source_schema_version=document.schema_version,
        components=schematic_components,
        wires=schematic_wires,
    )
