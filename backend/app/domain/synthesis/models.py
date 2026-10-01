"""Pydantic contracts for Step 18's real Yosys synthesis pipeline - a
downstream artifact of the Canonical IR, never a second source of truth.
Every synthesized cell/port here traces back to exactly one canonical IR
component via app.domain.synthesis.mapping - the original IR remains
authoritative even where Yosys's own optimizer has transformed the
design (see ComponentIdMapping.note for any honestly-reported
one-to-many/missing-cell case).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SynthesisError(BaseModel):
    """A single problem preventing (or affecting) synthesis - mirrors
    SchematicError/GuardrailIssue in spirit (code/message/path)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
    path: str


class ComponentIdMapping(BaseModel):
    """The real, deterministic correspondence between one canonical IR
    component and the synthesized Yosys cell(s) it produced. More than
    one synthesized_cell_names entry ONLY ever happens for a bus-width
    gate (bit-blasted, one cell per bit) - never a silent Yosys
    optimization merge, which is instead reported via `note`."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    canonical_component_id: str
    synthesized_cell_names: list[str] = Field(default_factory=list)
    note: str | None = None


class SynthesisIdMapping(BaseModel):
    """The full, honest reconstruction of canonical identity from a real
    Yosys JSON netlist. `unmapped_cell_names` lists any synthesized cell
    that could not be traced back to a canonical component (e.g. one
    Yosys's own optimizer introduced) - never guessed/omitted."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    component_mappings: list[ComponentIdMapping] = Field(default_factory=list)
    unmapped_cell_names: list[str] = Field(default_factory=list)
    top_level_ports: dict[str, str] = Field(default_factory=dict)


class SynthesisArtifacts(BaseModel):
    """The real artifacts a successful Yosys run produced - never
    fabricated/placeholder text."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    generated_verilog: str
    synthesized_verilog: str
    netlist_json_text: str
    stat_report: str


class SynthesisResult(BaseModel):
    """The deterministic outcome of run_synthesis(). No partial/fake
    artifacts are ever returned when is_valid is False."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[SynthesisError] = Field(default_factory=list)
    warnings: list[SynthesisError] = Field(default_factory=list)
    artifacts: SynthesisArtifacts | None = None
    id_mapping: SynthesisIdMapping | None = None
