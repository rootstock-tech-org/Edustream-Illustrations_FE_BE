"""Canonical cross-layer identity contracts.

`DesignIdentityLedger` is the unified, per-component view of a design's
identity across every representation layer this platform can currently
produce REAL data for:

  LOGICAL  - the canonical IRDocument itself (always present)
  HDL      - the generated Verilog RTL instance name (app.domain.hdl)
  PHYSICAL - the real placed DEF/GDS cell name(s) (app.domain.physical_design)

This is intentionally NOT a bigger set of layers than this codebase can
honestly back with real data today. A "synthesized-cell" layer distinct
from PHYSICAL is deliberately NOT modelled: this project's real physical
flow (LibreLane, straight to real SKY130 techmapping) never produces a
separate, inspectable generic-synthesis-only netlist stage before physical
placement - claiming a distinct synthesized-cell identity here would be
fabricated, not real. If a future flow ever produces one, extend
DesignLayer with a new value and this model's `synthesized_cell_names`
field then - never invent it ahead of real data.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class DesignLayer(str, Enum):
    """One representation layer this project can produce REAL evidence
    for. Deliberately a small, closed set - grow it only when a new layer
    gains real, inspectable data, never speculatively."""

    LOGICAL = "logical"
    HDL = "hdl"
    PHYSICAL = "physical"


class ComponentIdentityRecord(BaseModel):
    """One canonical component's identity, projected across every layer
    real evidence currently exists for. A layer missing from
    `layers_present` means genuinely unavailable for this component - never
    guessed/omitted silently."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    canonical_component_id: str
    canonical_kind: str
    canonical_name: str
    hdl_instance_name: str | None = None
    physical_cell_names: list[str] = Field(default_factory=list)
    def_pin_name: str | None = None
    layers_present: list[DesignLayer] = Field(default_factory=list)
    note: str | None = None


class DesignIdentityLedger(BaseModel):
    """The full, honest, per-component identity ledger for one completed
    physical-design job's source design. Connection-level identity is
    always reported unavailable (mirrors
    app.domain.physical_design.models.ConnectionIdentityStatus - the real
    toolchain has never been proven to preserve internal net names)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    document_id: str
    document_name: str
    hdl_module_name: str | None = None
    component_count: int
    mapped_component_count: int
    connection_identity_status: str = "unavailable"
    unmapped_physical_cell_count: int = 0
    records: list[ComponentIdentityRecord] = Field(default_factory=list)


class IdentityError(BaseModel):
    """A structured, honest failure to build/return an identity ledger -
    mirrors app.domain.physical_design.gds_models.GdsReadError's
    code/message shape for consistency with this project's other
    job-derived-artifact error contracts."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
