"""Schematic generation layer: a deterministic, traceable VIEW generated
FROM the validated/normalized Canonical IR - never a second source of
truth."""

from app.domain.schematic.errors import SchematicError
from app.domain.schematic.generator import generate_schematic
from app.domain.schematic.models import (
    RoutedPoint,
    SchematicComponent,
    SchematicDocument,
    SchematicEndpoint,
    SchematicPort,
    SchematicResult,
    SchematicWire,
)

__all__ = [
    "SchematicError",
    "generate_schematic",
    "RoutedPoint",
    "SchematicComponent",
    "SchematicDocument",
    "SchematicEndpoint",
    "SchematicPort",
    "SchematicResult",
    "SchematicWire",
]
