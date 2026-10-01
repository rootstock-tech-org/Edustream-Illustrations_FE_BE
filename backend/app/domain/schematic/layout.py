"""Simple, deterministic auto-layout for the schematic generator.

NOT an advanced circuit placer - a topological "longest path" layering
(a component with no incoming connection-driven predecessor lands in
column 0; everything else lands one column to the right of its
rightmost predecessor) plus deterministic vertical stacking within each
column. Isolated here so it can later be swapped for a more
sophisticated placer without touching generator.py's traceability logic.

Deliberately flat: a hierarchical MODULE and its children currently
layer purely by connection topology, not by parent/child nesting -
documented as a v1 simplification (hierarchy is still fully preserved
and traceable in the generated schematic's source_* ids, just not yet
reflected as nested visual grouping).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.ir.models import IRDocument, PortDirection

COLUMN_SPACING = 220.0
ROW_SPACING = 120.0
COMPONENT_WIDTH = 140.0
COMPONENT_HEIGHT = 80.0
PORT_MARGIN = 20.0
PORT_SPACING = 20.0


@dataclass(frozen=True)
class ComponentPlacement:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class PortPosition:
    x: float
    y: float


def compute_layout(document: IRDocument) -> dict[str, ComponentPlacement]:
    """Deterministically place every component in the document. Same
    input always produces the same output - no randomness, no wall-clock
    reads, no UUID generation."""

    layers = _compute_layers(document)

    by_layer: dict[int, list[str]] = {}
    for component_id, layer in layers.items():
        by_layer.setdefault(layer, []).append(component_id)

    placements: dict[str, ComponentPlacement] = {}
    for layer in sorted(by_layer):
        for row, component_id in enumerate(sorted(by_layer[layer])):
            placements[component_id] = ComponentPlacement(
                x=layer * COLUMN_SPACING,
                y=row * ROW_SPACING,
                width=COMPONENT_WIDTH,
                height=COMPONENT_HEIGHT,
            )
    return placements


def compute_port_positions(
    document: IRDocument,
    placements: dict[str, ComponentPlacement],
) -> dict[str, PortPosition]:
    """INPUT ports on the left edge, everything else (OUTPUT/INOUT) on the
    right edge, stacked top-to-bottom in deterministic port-id order."""

    positions: dict[str, PortPosition] = {}
    for component in sorted(document.components, key=lambda component: component.id):
        placement = placements[component.id]
        left_ports = sorted(
            (port for port in component.ports if port.direction == PortDirection.INPUT),
            key=lambda port: port.id,
        )
        right_ports = sorted(
            (port for port in component.ports if port.direction != PortDirection.INPUT),
            key=lambda port: port.id,
        )

        for index, port in enumerate(left_ports):
            positions[port.id] = PortPosition(x=placement.x, y=placement.y + PORT_MARGIN + index * PORT_SPACING)
        for index, port in enumerate(right_ports):
            positions[port.id] = PortPosition(
                x=placement.x + placement.width,
                y=placement.y + PORT_MARGIN + index * PORT_SPACING,
            )

    return positions


def _compute_layers(document: IRDocument) -> dict[str, int]:
    """Longest-path layering over the component-level connection graph,
    Kahn-style so it can never infinite-loop on a connection feedback
    cycle (e.g. a register feeding back into its own input through
    combinational logic - legitimate in real circuits, unlike a
    HIERARCHY cycle which guardrails already reject before this ever
    runs). Any component left over once the graph settles (i.e.
    genuinely part of such a cycle) is placed deterministically, in
    sorted id order, in the layer right after everything already placed.
    """

    component_ids = sorted(component.id for component in document.components)
    predecessors: dict[str, set[str]] = {component_id: set() for component_id in component_ids}

    for connection in sorted(document.connections, key=lambda connection: connection.id):
        source_id = connection.source.component_id
        target_id = connection.target.component_id
        if source_id in predecessors and target_id in predecessors and source_id != target_id:
            predecessors[target_id].add(source_id)

    layers: dict[str, int] = {}
    remaining = set(component_ids)

    progressed = True
    while remaining and progressed:
        progressed = False
        for component_id in sorted(remaining):
            preds = predecessors[component_id]
            if preds <= layers.keys():
                layers[component_id] = 0 if not preds else max(layers[p] for p in preds) + 1
                remaining.discard(component_id)
                progressed = True

    if remaining:
        next_layer = (max(layers.values()) + 1) if layers else 0
        for component_id in sorted(remaining):
            layers[component_id] = next_layer

    return layers
