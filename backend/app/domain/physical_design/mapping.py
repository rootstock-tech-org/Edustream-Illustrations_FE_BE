"""build_identity_mapping(def_text, hdl_module) -> PhysicalIdentityMapping

Deterministic, honest reconstruction of canonical IR identity from a real
DEF file, produced by the actual LibreLane/OpenROAD/Magic flow. Never
invents/guesses a mapping - see app/domain/physical_design/models.py's own
docstrings for the exact, evidence-grounded classification rules this
module implements (proven via the pre-implementation calibration
experiments in ~/experiments/step19_identity/multi/, not assumed).

Component identity: a real placed cell's instance name is checked against
`^([^/]+)/` (the hierarchical-path convention proven by every calibration
run); the EXTRACTED PREFIX is then required to exactly match a value in
`hdl_module.gate_instance_ids` (canonical_component_id -> verilog instance
name) before ever being attributed - never trusted as text alone. This
correctly handles canonical ids containing characters that Step 18's own
generator had to sanitize (e.g. "and-1" -> "and_1"), since the lookup goes
through the SAME table Step 18 itself built, not a re-derived guess.

Tool-generated cells: classified ONLY via the real DEF `+SOURCE <TAG>`
value, using EXACTLY the two tags actually observed in real evidence
(DIST = fill/tap/decap; TIMING = timing-repair buffers). Any other
(or absent) SOURCE tag on a cell with no name match is UNKNOWN - never
guessed to be either.

Connection identity: always reported `unavailable` - never computed at
all, since no experiment has proven internal net names recoverable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.hdl.generator import HdlModule
from app.domain.physical_design.models import (
    CellClassification,
    CellPlacement,
    ComponentPhysicalMapping,
    ConnectionIdentityStatus,
    PhysicalIdentityMapping,
    PortPhysicalMapping,
    UnmappedCell,
)

_COMPONENTS_LINE_RE = re.compile(
    r"^\s*-\s+(?P<name>\S+)\s+(?P<cell_type>\S+)(?P<rest>.*?);\s*$"
)
_SOURCE_TAG_RE = re.compile(r"\+\s*SOURCE\s+(?P<tag>[A-Z]+)")
_PLACEMENT_RE = re.compile(
    r"\+\s*(?:PLACED|FIXED)\s*\(\s*(?P<x>-?\d+)\s+(?P<y>-?\d+)\s*\)\s+(?P<orient>\S+)"
)
_PIN_LINE_RE = re.compile(r"^\s*-\s+(?P<name>\S+)\s+\+\s*NET\s+")
_UNITS_RE = re.compile(r"UNITS\s+DISTANCE\s+MICRONS\s+(?P<factor>\d+)")
_DIEAREA_RE = re.compile(
    r"DIEAREA\s*\(\s*-?\d+\s+-?\d+\s*\)\s*\(\s*(?P<x2>-?\d+)\s+(?P<y2>-?\d+)\s*\)"
)
_DEFAULT_UNITS_FACTOR = 1000  # the near-universal DEF convention when absent

_SOURCE_TAG_TO_CLASSIFICATION = {
    "DIST": CellClassification.TOOL_GENERATED_FILL,
    "TIMING": CellClassification.TOOL_GENERATED_TIMING,
}


@dataclass(frozen=True)
class _ParsedComponent:
    instance_name: str
    cell_type: str
    source_tag: str | None
    x_db_units: int | None
    y_db_units: int | None
    orientation: str | None


def _parse_components_section(def_text: str) -> list[_ParsedComponent]:
    """Extract every `COMPONENTS ... END COMPONENTS` entry. Deliberately
    line-based (DEF's COMPONENTS entries are always one logical line here,
    matching every real DEF observed in calibration) rather than a full
    DEF grammar parser - sufficient and verified against real files."""

    try:
        body = def_text.split("COMPONENTS", 1)[1]
        body = body.split("END COMPONENTS", 1)[0]
    except IndexError:
        return []

    components: list[_ParsedComponent] = []
    for line in body.splitlines():
        match = _COMPONENTS_LINE_RE.match(line)
        if not match:
            continue
        rest = match.group("rest")
        source_match = _SOURCE_TAG_RE.search(rest)
        placement_match = _PLACEMENT_RE.search(rest)
        components.append(
            _ParsedComponent(
                instance_name=match.group("name"),
                cell_type=match.group("cell_type"),
                source_tag=source_match.group("tag") if source_match else None,
                x_db_units=int(placement_match.group("x")) if placement_match else None,
                y_db_units=int(placement_match.group("y")) if placement_match else None,
                orientation=placement_match.group("orient") if placement_match else None,
            )
        )
    return components


def _parse_units_factor(def_text: str) -> int:
    match = _UNITS_RE.search(def_text)
    return int(match.group("factor")) if match else _DEFAULT_UNITS_FACTOR


def parse_die_area_um(def_text: str) -> tuple[float, float] | None:
    """The real DIEAREA from the DEF, converted to microns - never
    fabricated; returns None if the DEF has no DIEAREA statement at all."""

    match = _DIEAREA_RE.search(def_text)
    if match is None:
        return None
    units_factor = _parse_units_factor(def_text)
    return (int(match.group("x2")) / units_factor, int(match.group("y2")) / units_factor)


def _parse_pin_names(def_text: str) -> list[str]:
    try:
        body = def_text.split("\nPINS", 1)[1]
        body = body.split("END PINS", 1)[0]
    except IndexError:
        return []

    names: list[str] = []
    for line in body.splitlines():
        match = _PIN_LINE_RE.match(line)
        if match:
            names.append(match.group("name"))
    return names


def build_identity_mapping(def_text: str, hdl_module: HdlModule) -> PhysicalIdentityMapping:
    expected_instance_to_component = {
        instance_name: component_id
        for component_id, instance_name in hdl_module.gate_instance_ids.items()
    }
    units_factor = _parse_units_factor(def_text)

    found_cells_by_component: dict[str, list[str]] = {}
    unmapped_cells: list[UnmappedCell] = []
    cell_placements: list[CellPlacement] = []

    for component in _parse_components_section(def_text):
        prefix = component.instance_name.split("/", 1)[0]
        canonical_component_id = expected_instance_to_component.get(prefix)

        if canonical_component_id is not None:
            found_cells_by_component.setdefault(canonical_component_id, []).append(
                component.instance_name
            )
            classification = CellClassification.CANONICAL
        else:
            classification = _SOURCE_TAG_TO_CLASSIFICATION.get(
                component.source_tag or "", CellClassification.UNKNOWN
            )
            unmapped_cells.append(
                UnmappedCell(
                    cell_name=component.instance_name,
                    cell_type=component.cell_type,
                    classification=classification,
                )
            )

        if component.x_db_units is not None and component.y_db_units is not None:
            cell_placements.append(
                CellPlacement(
                    cell_name=component.instance_name,
                    cell_type=component.cell_type,
                    x=component.x_db_units / units_factor,
                    y=component.y_db_units / units_factor,
                    orientation=component.orientation or "N",
                    classification=classification,
                    canonical_component_id=canonical_component_id,
                )
            )

    component_mappings = [
        ComponentPhysicalMapping(
            canonical_component_id=component_id,
            physical_cell_names=sorted(found_cells_by_component.get(component_id, [])),
            note=(
                "No matching physical cell found for this canonical component."
                if component_id not in found_cells_by_component
                else None
            ),
        )
        for component_id in hdl_module.gate_instance_ids
    ]

    pin_names = set(_parse_pin_names(def_text))
    port_mappings = [
        PortPhysicalMapping(canonical_component_id=component_id, def_pin_name=pin_name)
        for pin_name, component_id in hdl_module.top_level_ports.items()
        if pin_name in pin_names
    ]

    return PhysicalIdentityMapping(
        component_mappings=component_mappings,
        port_mappings=port_mappings,
        unmapped_cells=unmapped_cells,
        connection_identity_status=ConnectionIdentityStatus.UNAVAILABLE,
        cell_placements=cell_placements,
    )
