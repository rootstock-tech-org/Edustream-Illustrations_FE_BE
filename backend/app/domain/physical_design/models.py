"""Pydantic contracts for Step 19's real physical-design pipeline (LibreLane
+ real SKY130 techmapping + real OpenROAD floorplan/PDN/placement/routing +
real Magic GDS export). A downstream artifact of the Canonical IR, never a
second source of truth - the original IR remains authoritative regardless of
what the real toolchain does to the design.

Every field/enum here is grounded in real, observed evidence from the
pre-implementation calibration experiments (see repo memory) - never
speculative. In particular:
- `ConnectionIdentityStatus` has no "exact"/"derived" value at all - the
  experiments never proved internal net -> Connection.id recoverability, so
  the type itself makes that claim structurally impossible to make by
  accident.
- `PhysicalCellClassification` only has the two verified tool-generated
  categories actually observed in real DEF `+SOURCE` tags (DIST, TIMING),
  plus CANONICAL (name-matched against HdlModule's own tables) and UNKNOWN
  (never guessed).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


class FailureCode(str, Enum):
    """Uppercase snake_case values, matching this project's existing
    failure-code convention (e.g. Step 18's UNSUPPORTED_COMPONENT_KIND/
    YOSYS_NOT_FOUND) - never a different casing scheme."""

    TOOL_NOT_AVAILABLE = "TOOL_NOT_AVAILABLE"
    INVALID_IR = "INVALID_IR"
    UNSUPPORTED_COMPONENT_KIND = "UNSUPPORTED_COMPONENT_KIND"
    HDL_GENERATION_FAILED = "HDL_GENERATION_FAILED"
    SYNTHESIS_FAILED = "SYNTHESIS_FAILED"
    FLOORPLAN_FAILED = "FLOORPLAN_FAILED"
    PLACEMENT_FAILED = "PLACEMENT_FAILED"
    ROUTING_FAILED = "ROUTING_FAILED"
    GDS_EXPORT_FAILED = "GDS_EXPORT_FAILED"
    DRC_FAILED = "DRC_FAILED"
    LVS_FAILED = "LVS_FAILED"
    ANTENNA_FAILED = "ANTENNA_FAILED"
    TIMED_OUT = "TIMED_OUT"
    CANCELLED = "CANCELLED"
    UNKNOWN_FLOW_FAILURE = "UNKNOWN_FLOW_FAILURE"


class PhysicalDesignError(BaseModel):
    """Mirrors SynthesisError/SchematicError - code/message/path."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str


class CellClassification(str, Enum):
    """How one real placed DEF cell relates to the canonical IR - never a
    fabricated/guessed relationship."""

    CANONICAL = "canonical"  # name-matched against HdlModule.gate_instance_ids
    TOOL_GENERATED_FILL = "tool_generated_fill"  # real DEF `+SOURCE DIST`
    TOOL_GENERATED_TIMING = "tool_generated_timing"  # real DEF `+SOURCE TIMING`
    UNKNOWN = "unknown"  # no name match, no recognized SOURCE tag - never guessed


class ConnectionIdentityStatus(str, Enum):
    """Deliberately has no 'exact'/'derived' value - the calibration
    experiments never proved internal net -> Connection.id recoverability."""

    UNAVAILABLE = "unavailable"


class ComponentPhysicalMapping(BaseModel):
    """One canonical component's real, evidence-based physical mapping."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    canonical_component_id: str
    physical_cell_names: list[str] = Field(default_factory=list)
    note: str | None = None


class UnmappedCell(BaseModel):
    """A real placed DEF cell that could not be attributed to any canonical
    component - always reported, never silently dropped."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    cell_name: str
    cell_type: str
    classification: CellClassification


class CellPlacement(BaseModel):
    """One real placed DEF cell's exact position (Step 20: real,
    artifact-derived visualization data - never fabricated coordinates).
    `x`/`y` are in real microns (converted from DEF database units via the
    DEF's own `UNITS DISTANCE MICRONS` factor). Emitted for EVERY real
    placed cell (canonical and tool-generated alike) so a frontend can
    render the actual DEF-derived floorplan without guessing."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    cell_name: str
    cell_type: str
    x: float
    y: float
    orientation: str
    classification: CellClassification
    canonical_component_id: str | None = None


class PortPhysicalMapping(BaseModel):
    """A top-level canonical Port.id's real DEF PIN - proven exact by the
    experiments (module boundaries are never touched by internal cell
    naming/optimization)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    canonical_component_id: str
    def_pin_name: str


class PhysicalIdentityMapping(BaseModel):
    """The full, honest reconstruction of canonical identity from a real
    DEF. Connection-level identity is always `unavailable` - see
    ConnectionIdentityStatus's own docstring for why."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    component_mappings: list[ComponentPhysicalMapping] = Field(default_factory=list)
    port_mappings: list[PortPhysicalMapping] = Field(default_factory=list)
    unmapped_cells: list[UnmappedCell] = Field(default_factory=list)
    connection_identity_status: ConnectionIdentityStatus = ConnectionIdentityStatus.UNAVAILABLE
    cell_placements: list[CellPlacement] = Field(default_factory=list)


class ArtifactMetadata(BaseModel):
    """A reference to a real, on-disk artifact - never the raw file content
    inlined into JSON (DEF/GDS/netlists/logs can be tens of MB)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    artifact_type: str  # "def" | "gds" | "netlist" | "metrics_json" | "log"
    file_name: str
    size_bytes: int


class SignoffStatus(BaseModel):
    """Real DRC/LVS/Antenna pass/fail, straight from the toolchain's own
    metrics - never inferred/assumed."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    drc_passed: bool | None = None
    lvs_passed: bool | None = None
    antenna_passed: bool | None = None
    drc_error_count: int | None = None
    lvs_error_count: int | None = None


class PhysicalDesignResult(BaseModel):
    """The deterministic outcome of one completed (or failed) physical-design
    job. No partial/fabricated artifacts are ever reported as present."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[PhysicalDesignError] = Field(default_factory=list)
    signoff: SignoffStatus | None = None
    identity_mapping: PhysicalIdentityMapping | None = None
    artifacts: list[ArtifactMetadata] = Field(default_factory=list)
    metrics: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    die_width_um: float | None = None
    die_height_um: float | None = None


class PhysicalDesignJob(BaseModel):
    """A single physical-design job's full lifecycle record."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    job_id: str
    status: JobStatus
    failure_code: FailureCode | None = None
    failure_message: str | None = None
    created_at: datetime
    updated_at: datetime
    result: PhysicalDesignResult | None = None
    source_document: dict[str, Any] | None = Field(
        default=None,
        description=(
            "The raw Canonical IR document dict this job was built from - "
            "retained so a later identity-ledger request can honestly "
            "re-derive HDL identity without re-running any real tool. "
            "None for a job created before this field existed."
        ),
    )
