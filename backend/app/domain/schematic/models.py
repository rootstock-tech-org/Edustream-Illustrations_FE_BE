"""Deterministic schematic representation generated FROM the Canonical
IR. This is a downstream VIEW, never a second source of truth - every
object here traces back to exactly one IR object via a source_*_id
field. Existing IR types (PortDirection, BitRange) are reused directly
rather than redefined.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.ir.models import BitRange, PortDirection
from app.domain.schematic.errors import SchematicError


class SchematicPort(BaseModel):
    """A rendered port on a SchematicComponent."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_port_id: str
    name: str
    direction: PortDirection
    width: int
    x: float
    y: float


class SchematicComponent(BaseModel):
    """A rendered component box, generated 1:1 from exactly one IR Component."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_component_id: str
    kind: str
    name: str
    x: float
    y: float
    width: float
    height: float
    ports: list[SchematicPort] = Field(default_factory=list)


class SchematicEndpoint(BaseModel):
    """One side of a SchematicWire - which schematic component/port it
    lands on, plus the exact IR-level reference it was generated from."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    component_id: str
    port_id: str
    source_component_id: str
    source_port_id: str
    bit_range: BitRange | None = None


class RoutedPoint(BaseModel):
    """One (x, y) waypoint along a SchematicWire's route."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    x: float
    y: float


class SchematicWire(BaseModel):
    """A rendered wire, generated 1:1 from exactly one IR Connection."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_connection_id: str
    source: SchematicEndpoint
    target: SchematicEndpoint
    points: list[RoutedPoint] = Field(default_factory=list)


class SchematicDocument(BaseModel):
    """The full generated schematic for one IRDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_document_id: str
    source_schema_version: str
    components: list[SchematicComponent] = Field(default_factory=list)
    wires: list[SchematicWire] = Field(default_factory=list)


class SchematicResult(BaseModel):
    """The deterministic outcome of generate_schematic(). No partial
    schematic is ever returned when is_valid is False."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[SchematicError] = Field(default_factory=list)
    warnings: list[SchematicError] = Field(default_factory=list)
    schematic: SchematicDocument | None = None
