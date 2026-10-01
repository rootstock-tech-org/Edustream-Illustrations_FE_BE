"""generate_physical_layout(document) -> PhysicalResult - the single
public entry point for Step 7.

Never re-implements Step 2/3 validation; safety is entirely delegated to
app.domain.guardrails.run_guardrails(). Never imports app.domain.schematic
or app.domain.simulation - the physical layer is independent of both.
"""

from __future__ import annotations

from app.domain.guardrails.models import GuardrailIssue
from app.domain.guardrails.validator import run_guardrails
from app.domain.ir.models import IRDocument
from app.domain.physical.errors import PhysicalError
from app.domain.physical.layout import compute_die_bounds, compute_floorplan, compute_pin_positions
from app.domain.physical.models import (
    PhysicalBlock,
    PhysicalDocument,
    PhysicalEndpoint,
    PhysicalNet,
    PhysicalPin,
    PhysicalResult,
)
from app.domain.physical.validation import validate_physical_document


def generate_physical_layout(document: IRDocument) -> PhysicalResult:
    """Validate+normalize via guardrails, then deterministically build a
    PhysicalDocument. Returns a structured failure (physical=None) -
    never a partial layout - whenever the IR is not safe to consume, or
    (defensively) if the freshly-built PhysicalDocument itself somehow
    fails its own structural validation."""

    guardrail_result = run_guardrails(document)
    warnings = [_from_guardrail_issue(issue) for issue in guardrail_result.warnings]

    if not guardrail_result.is_valid or guardrail_result.normalized_document is None:
        errors = [_from_guardrail_issue(issue) for issue in guardrail_result.errors]
        return PhysicalResult(is_valid=False, errors=errors, warnings=warnings, physical=None)

    physical = _build_physical_document(guardrail_result.normalized_document)

    validation_result = validate_physical_document(physical)
    if not validation_result.is_valid:
        return PhysicalResult(is_valid=False, errors=validation_result.errors, warnings=warnings, physical=None)

    return PhysicalResult(is_valid=True, errors=[], warnings=warnings, physical=physical)


def _from_guardrail_issue(issue: GuardrailIssue) -> PhysicalError:
    return PhysicalError(code=issue.code, message=issue.message, path=issue.path)


def _build_physical_document(document: IRDocument) -> PhysicalDocument:
    placements = compute_floorplan(document)
    pin_positions = compute_pin_positions(document, placements)
    die_width, die_height = compute_die_bounds(placements)

    blocks: list[PhysicalBlock] = []
    for component in sorted(document.components, key=lambda component: component.id):
        placement = placements[component.id]
        pins = [
            PhysicalPin(
                id=f"pin_{port.id}",
                source_port_id=port.id,
                name=port.name,
                direction=port.direction,
                x=pin_positions[port.id].x,
                y=pin_positions[port.id].y,
            )
            for port in sorted(component.ports, key=lambda port: port.id)
        ]
        blocks.append(
            PhysicalBlock(
                id=f"phys_{component.id}",
                source_component_id=component.id,
                kind=component.kind,
                name=component.name,
                x=placement.x,
                y=placement.y,
                width=placement.width,
                height=placement.height,
                area=placement.width * placement.height,
                pins=pins,
            )
        )

    nets: list[PhysicalNet] = []
    for connection in sorted(document.connections, key=lambda connection: connection.id):
        nets.append(
            PhysicalNet(
                id=f"net_{connection.id}",
                source_connection_id=connection.id,
                source=PhysicalEndpoint(
                    block_id=f"phys_{connection.source.component_id}",
                    pin_id=f"pin_{connection.source.port_id}",
                    source_component_id=connection.source.component_id,
                    source_port_id=connection.source.port_id,
                ),
                target=PhysicalEndpoint(
                    block_id=f"phys_{connection.target.component_id}",
                    pin_id=f"pin_{connection.target.port_id}",
                    source_component_id=connection.target.component_id,
                    source_port_id=connection.target.port_id,
                ),
            )
        )

    return PhysicalDocument(
        source_document_id=document.id,
        source_schema_version=document.schema_version,
        die_width=die_width,
        die_height=die_height,
        blocks=blocks,
        nets=nets,
    )
