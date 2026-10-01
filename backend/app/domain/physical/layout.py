"""Simple, deterministic synthetic floorplan for the physical domain.

NOT a real area-optimized placer/floorplanner (that is genuine EDA work,
deferred to a future step integrating a real toolchain). This is a
shelf-packing placement: blocks are laid out left-to-right in
deterministic sorted-id order, wrapping to a new row once a row-width
budget is exceeded - simple, stable, and easy to reason about.

Block sizing is a small, explicit, documented, technology-agnostic rule
(base size + a per-extra-pin growth term) - NOT derived from any real
process/technology (PDK) library.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.ir.models import Component, IRDocument, PortDirection

BLOCK_BASE_WIDTH = 40.0
BLOCK_BASE_HEIGHT = 40.0
BLOCK_WIDTH_PER_EXTRA_PORT = 10.0
MAX_ROW_WIDTH = 400.0
BLOCK_SPACING = 20.0
ROW_SPACING = 20.0
PIN_MARGIN = 8.0
PIN_SPACING = 10.0


@dataclass(frozen=True)
class BlockPlacement:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class PinPosition:
    x: float
    y: float


def block_size(component: Component) -> tuple[float, float]:
    """A small, explicit, technology-agnostic sizing rule: a fixed base
    size that grows slightly with pin count. Illustrative only."""

    extra_ports = max(0, len(component.ports) - 2)
    width = BLOCK_BASE_WIDTH + extra_ports * BLOCK_WIDTH_PER_EXTRA_PORT
    height = BLOCK_BASE_HEIGHT
    return width, height


def compute_floorplan(document: IRDocument) -> dict[str, BlockPlacement]:
    """Deterministically place every component as a physical block using
    simple shelf packing. Same input always produces the same output."""

    placements: dict[str, BlockPlacement] = {}

    x_cursor = 0.0
    y_cursor = 0.0
    row_height = 0.0

    for component in sorted(document.components, key=lambda component: component.id):
        width, height = block_size(component)

        if x_cursor > 0.0 and x_cursor + width > MAX_ROW_WIDTH:
            x_cursor = 0.0
            y_cursor += row_height + ROW_SPACING
            row_height = 0.0

        placements[component.id] = BlockPlacement(x=x_cursor, y=y_cursor, width=width, height=height)
        x_cursor += width + BLOCK_SPACING
        row_height = max(row_height, height)

    return placements


def compute_die_bounds(placements: dict[str, BlockPlacement]) -> tuple[float, float]:
    """The bounding box (die width/height) enclosing every placed block."""

    if not placements:
        return 0.0, 0.0

    die_width = max(placement.x + placement.width for placement in placements.values())
    die_height = max(placement.y + placement.height for placement in placements.values())
    return die_width, die_height


def compute_pin_positions(
    document: IRDocument,
    placements: dict[str, BlockPlacement],
) -> dict[str, PinPosition]:
    """INPUT ports on a block's left edge, everything else (OUTPUT/INOUT)
    on the right edge, stacked top-to-bottom in deterministic port-id
    order - the same real physical-pin-placement convention used by
    app.domain.schematic.layout, applied here to block boundaries."""

    positions: dict[str, PinPosition] = {}
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
            positions[port.id] = PinPosition(x=placement.x, y=placement.y + PIN_MARGIN + index * PIN_SPACING)
        for index, port in enumerate(right_ports):
            positions[port.id] = PinPosition(
                x=placement.x + placement.width,
                y=placement.y + PIN_MARGIN + index * PIN_SPACING,
            )

    return positions
