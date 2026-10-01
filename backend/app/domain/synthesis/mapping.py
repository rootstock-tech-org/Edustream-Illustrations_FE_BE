"""build_id_mapping(netlist_json, ...) -> SynthesisIdMapping

Deterministic, honest reconstruction of canonical IR identity from a real
Yosys JSON netlist. Never invents/guesses a mapping: a synthesized cell
is only ever attributed to a canonical component id if its OWN Verilog
instance name (the primary, verified-working mechanism - see
app.domain.hdl.generator's module docstring for why every gate is a
named submodule instance rather than a raw builtin primitive) or its
`canonical_component_id` attribute (a redundant, defense-in-depth
secondary signal) says so. Anything else is reported as unmapped, never
silently guessed. The canonical IR always remains authoritative - this
mapping is purely a lookup FROM synthesized cells back TO it, never the
other way around.
"""

from __future__ import annotations

from typing import Any

from app.domain.synthesis.models import ComponentIdMapping, SynthesisIdMapping


def build_id_mapping(
    netlist_json: dict[str, Any],
    module_name: str,
    top_level_ports: dict[str, str],
    gate_instance_ids: dict[str, str],
) -> SynthesisIdMapping:
    modules = netlist_json.get("modules", {})
    module = modules.get(module_name, {})
    cells = module.get("cells", {})

    expected_cell_to_component: dict[str, str] = {
        instance_name: component_id for component_id, instance_name in gate_instance_ids.items()
    }

    found_cells_by_component: dict[str, list[str]] = {}
    unmapped_cell_names: list[str] = []

    for cell_name, cell_data in cells.items():
        component_id = expected_cell_to_component.get(cell_name)
        if component_id is None and isinstance(cell_data, dict):
            attributes = cell_data.get("attributes", {})
            if isinstance(attributes, dict):
                component_id = attributes.get("canonical_component_id")
        if component_id is None:
            unmapped_cell_names.append(cell_name)
            continue
        found_cells_by_component.setdefault(component_id, []).append(cell_name)

    component_mappings: list[ComponentIdMapping] = []
    for component_id, expected_instance_name in gate_instance_ids.items():
        found = sorted(found_cells_by_component.get(component_id, []))

        note_parts: list[str] = []
        if len(found) > 1:
            note_parts.append(
                "More than one synthesized cell mapped to this single canonical "
                "component - a real Yosys optimization created a one-to-many "
                "relationship, reported honestly rather than picking one "
                "arbitrary cell as authoritative."
            )
        if expected_instance_name not in found:
            note_parts.append(
                f"WARNING: expected cell '{expected_instance_name}' was not "
                "found in the synthesized netlist (likely optimized away "
                "despite `keep`)."
            )

        component_mappings.append(
            ComponentIdMapping(
                canonical_component_id=component_id,
                synthesized_cell_names=found,
                note=" ".join(note_parts) or None,
            )
        )

    return SynthesisIdMapping(
        component_mappings=component_mappings,
        unmapped_cell_names=sorted(unmapped_cell_names),
        top_level_ports=dict(top_level_ports),
    )
