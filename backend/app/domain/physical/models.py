"""Foundational physical/silicon representation - a deterministic,
traceable downstream VIEW generated FROM the validated/normalized
Canonical IR, exactly like app.domain.schematic and app.domain.simulation.
Never a second source of truth.

Deliberately SYNTHETIC/illustrative at this step: block sizes and the die
floorplan are computed from simple, documented, technology-agnostic
rules - NOT derived from any real process/technology (PDK) library,
since no EDA toolchain integration exists yet. Real routing geometry is
also out of scope here: a PhysicalNet records WHICH pins connect (for
traceability), never a real DRC-compliant routed path - that is real EDA
work, deferred to a future step.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.ir.models import PortDirection
from app.domain.physical.errors import PhysicalError


class PhysicalPin(BaseModel):
    """A physical pin on a PhysicalBlock's boundary, traced back to
    exactly one Canonical IR Port."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_port_id: str
    name: str
    direction: PortDirection
    x: float
    y: float


class PhysicalBlock(BaseModel):
    """A placed physical block, generated 1:1 from exactly one IR
    Component. `width`/`height`/`area` are illustrative units from a
    simple synthetic sizing rule (see layout.py) - not real silicon
    dimensions."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_component_id: str
    kind: str
    name: str
    x: float
    y: float
    width: float
    height: float
    area: float
    pins: list[PhysicalPin] = Field(default_factory=list)


class PhysicalEndpoint(BaseModel):
    """One side of a PhysicalNet: a specific pin on a specific block,
    plus the exact IR-level reference it was generated from."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    block_id: str
    pin_id: str
    source_component_id: str
    source_port_id: str


class PhysicalNet(BaseModel):
    """Structural connectivity between two physical pins, generated 1:1
    from exactly one IR Connection. Deliberately carries NO routed
    geometry - this records WHICH pins connect, never a real
    DRC-compliant routed path."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_connection_id: str
    source: PhysicalEndpoint
    target: PhysicalEndpoint


class PhysicalDocument(BaseModel):
    """The full generated physical floorplan for one IRDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_document_id: str
    source_schema_version: str
    die_width: float
    die_height: float
    blocks: list[PhysicalBlock] = Field(default_factory=list)
    nets: list[PhysicalNet] = Field(default_factory=list)


class PhysicalResult(BaseModel):
    """The deterministic outcome of generate_physical_layout(). No
    partial/fake physical document is ever returned when is_valid is
    False."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[PhysicalError] = Field(default_factory=list)
    warnings: list[PhysicalError] = Field(default_factory=list)
    physical: PhysicalDocument | None = None
