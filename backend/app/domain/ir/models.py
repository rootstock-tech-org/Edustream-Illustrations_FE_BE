"""Canonical VLSI Intermediate Representation (IR) - the single source of
truth every future service (guardrails, schematic compiler, simulation,
physical/EDA flow, 3D digital twin) must consume without inventing its own
representation of a circuit.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

CURRENT_SCHEMA_VERSION = "1.0.0"
SUPPORTED_SCHEMA_VERSIONS = frozenset({CURRENT_SCHEMA_VERSION})


class PortDirection(str, Enum):
    """Signal direction of a Port - a real electrical property, so (unlike
    Component.kind) this is deliberately a small, closed set."""

    INPUT = "input"
    OUTPUT = "output"
    INOUT = "inout"


class ResetPolarity(str, Enum):
    """Which logic level actually asserts a reset signal. Deliberately a
    closed enum (like PortDirection) - a real electrical property, not an
    open-ended kind string. Never inferred from a port name; a component
    either declares this explicitly via ResetSpec or has no reset at all."""

    ACTIVE_HIGH = "active_high"
    ACTIVE_LOW = "active_low"


class ResetTiming(str, Enum):
    """Whether a reset takes effect only on a clock edge (synchronous) or
    immediately, independent of the clock (asynchronous)."""

    SYNCHRONOUS = "synchronous"
    ASYNCHRONOUS = "asynchronous"


class ResetSpec(BaseModel):
    """Explicit, structural reset semantics for a sequential Component
    (currently DFF only). Presence of this field - not the existence of
    any particular port name - is the sole signal that a component has a
    reset at all: `Component.reset is None` means "no reset", full stop.
    Generic on Component (not DFF-specific) so registers/counters/FSMs
    added later reuse this exact same field without any IR redesign."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    polarity: ResetPolarity
    timing: ResetTiming


class BitRange(BaseModel):
    """An inclusive [lsb, msb] bit slice, e.g. bits 7 down to 0 of a bus."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    msb: int
    lsb: int = 0

    @model_validator(mode="after")
    def _check_order(self) -> "BitRange":
        if self.lsb < 0:
            raise ValueError("lsb must be >= 0.")
        if self.msb < self.lsb:
            raise ValueError("msb must be >= lsb.")
        return self

    @property
    def width(self) -> int:
        return self.msb - self.lsb + 1


class VisualMetadata(BaseModel):
    """Optional, non-authoritative rendering hints. Never affects circuit
    semantics - only future schematic/3D layers may read this."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    x: float | None = None
    y: float | None = None
    label: str | None = None


class Parameter(BaseModel):
    """A single named configuration value attached to a Component (e.g.
    bit width, reset polarity, initial value)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    value: JsonValue = None


class Port(BaseModel):
    """A single named signal terminal on a Component."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    name: str
    direction: PortDirection
    width: int = Field(gt=0, description="Bit width of this port. Must be a positive integer.")
    type: str | None = Field(
        default=None,
        description="Open-ended signal role hint, e.g. 'clock', 'reset', 'data'.",
    )
    bit_range: BitRange | None = None

    @model_validator(mode="after")
    def _check_bit_range_fits_width(self) -> "Port":
        if self.bit_range is not None and self.bit_range.width > self.width:
            raise ValueError(
                f"Port '{self.id}' bit_range width {self.bit_range.width} "
                f"exceeds declared port width {self.width}."
            )
        return self


class Component(BaseModel):
    """A logical VLSI component (gate, register, module, transistor, etc.).

    `kind` is deliberately a plain, open string - NOT a closed enum. This IR
    must be able to represent any component a future knowledge/whitelist
    service decides to support, without a schema change every time a new
    VLSI concept is added. Examples: AND, OR, NOT, XOR, NAND, NOR, MUX, DFF,
    REGISTER, COUNTER, ALU, NMOS, PMOS, CMOS_INVERTER, MODULE - but any
    string is structurally valid here.

    `reset` is optional and generic (not DFF-specific in this model) - see
    ResetSpec's own docstring. It defaults to None so every existing
    document/component built before reset semantics existed remains valid
    and behaves exactly as before.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    kind: str
    name: str
    parent_id: str | None = None
    ports: list[Port] = Field(default_factory=list)
    parameters: list[Parameter] = Field(default_factory=list)
    visual: VisualMetadata | None = None
    reset: ResetSpec | None = None


class ConnectionEndpoint(BaseModel):
    """One side of a Connection: a specific port on a specific component."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    component_id: str
    port_id: str
    bit_range: BitRange | None = None


class Connection(BaseModel):
    """A net wiring one component's port to another's."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source: ConnectionEndpoint
    target: ConnectionEndpoint


class Annotation(BaseModel):
    """A free-form note attached to the design, optionally pointing at a
    specific component/port/connection id."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    text: str
    target_id: str | None = None
    visual: VisualMetadata | None = None


class Provenance(BaseModel):
    """Where this IRDocument came from. Never store secrets/API keys/raw
    credentials here - this is audit metadata, not a secrets store."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source: str = Field(
        description="e.g. 'manual', 'ai_generated', 'imported', 'derived'."
    )
    created_at: datetime
    created_by: str | None = None
    request_id: str | None = None
    parent_version: str | None = None
    notes: str | None = None


class IRDocument(BaseModel):
    """The canonical VLSI Intermediate Representation. Every future service
    in this platform consumes/produces this exact model - never a private,
    incompatible representation of the same circuit."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    schema_version: str
    design_version: str
    parent_version: str | None = None
    name: str
    components: list[Component] = Field(default_factory=list)
    connections: list[Connection] = Field(default_factory=list)
    annotations: list[Annotation] = Field(default_factory=list)
    root_component_ids: list[str] = Field(default_factory=list)
    provenance: Provenance | None = None
