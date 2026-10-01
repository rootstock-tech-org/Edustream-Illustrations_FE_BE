"""build_design_identity_ledger(document, hdl_module, identity_mapping)
-> DesignIdentityLedger

Pure aggregation - NEVER re-parses a DEF/GDS/Verilog file itself and NEVER
re-implements any identity-matching logic. It only PROJECTS three
already-real, already-computed sources into one unified per-component
view:

  1. app.domain.ir.models.IRDocument       - the canonical component list
     (LOGICAL layer, always present for every component in the document).
  2. app.domain.hdl.generator.HdlModule    - `gate_instance_ids` (canonical
     component id -> Verilog gate instance name) and `top_level_ports`
     (Verilog port name -> canonical component id) (HDL layer).
  3. app.domain.physical_design.models.PhysicalIdentityMapping -
     `component_mappings` (canonical component id -> real placed DEF/GDS
     cell names) and `port_mappings` (canonical component id -> real DEF
     pin name) (PHYSICAL layer).

`hdl_module`/`identity_mapping` are both optional so this can still build
an honest, partial ledger (LOGICAL-only) if a caller only has the source
document - never crashes, never fabricates a layer it wasn't given real
data for.
"""

from __future__ import annotations

from app.domain.hdl.generator import HdlModule
from app.domain.identity.models import (
    ComponentIdentityRecord,
    DesignIdentityLedger,
    DesignLayer,
)
from app.domain.ir.models import IRDocument
from app.domain.physical_design.models import PhysicalIdentityMapping


def build_design_identity_ledger(
    document: IRDocument,
    hdl_module: HdlModule | None = None,
    identity_mapping: PhysicalIdentityMapping | None = None,
) -> DesignIdentityLedger:
    hdl_component_ids_by_component = (
        hdl_module.gate_instance_ids if hdl_module is not None else {}
    )
    # top_level_ports is keyed the OTHER way round (verilog port name ->
    # canonical component id) - build the reverse lookup once here.
    hdl_port_name_by_component_id: dict[str, str] = {}
    if hdl_module is not None:
        for port_name, component_id in hdl_module.top_level_ports.items():
            hdl_port_name_by_component_id[component_id] = port_name

    physical_cells_by_component: dict[str, list[str]] = {}
    physical_note_by_component: dict[str, str | None] = {}
    if identity_mapping is not None:
        for mapping in identity_mapping.component_mappings:
            component_id = mapping.canonical_component_id
            physical_cells_by_component[component_id] = mapping.physical_cell_names
            physical_note_by_component[component_id] = mapping.note

    def_pin_by_component: dict[str, str] = {}
    if identity_mapping is not None:
        for port_mapping in identity_mapping.port_mappings:
            def_pin_by_component[port_mapping.canonical_component_id] = port_mapping.def_pin_name

    records: list[ComponentIdentityRecord] = []
    mapped_component_count = 0

    for component in document.components:
        layers_present: list[DesignLayer] = [DesignLayer.LOGICAL]

        hdl_instance_name = hdl_component_ids_by_component.get(component.id)
        if hdl_instance_name is None:
            hdl_instance_name = hdl_port_name_by_component_id.get(component.id)
        if hdl_instance_name is not None:
            layers_present.append(DesignLayer.HDL)

        physical_cell_names = physical_cells_by_component.get(component.id, [])
        def_pin_name = def_pin_by_component.get(component.id)
        if physical_cell_names or def_pin_name is not None:
            layers_present.append(DesignLayer.PHYSICAL)

        is_mapped = DesignLayer.PHYSICAL in layers_present
        if is_mapped:
            mapped_component_count += 1

        note = physical_note_by_component.get(component.id)
        if note is None and identity_mapping is not None and not is_mapped:
            note = "No matching physical cell found for this canonical component."

        records.append(
            ComponentIdentityRecord(
                canonical_component_id=component.id,
                canonical_kind=component.kind,
                canonical_name=component.name,
                hdl_instance_name=hdl_instance_name,
                physical_cell_names=physical_cell_names,
                def_pin_name=def_pin_name,
                layers_present=layers_present,
                note=note,
            )
        )

    unmapped_physical_cell_count = 0
    if identity_mapping is not None:
        unmapped_physical_cell_count = len(identity_mapping.unmapped_cells)

    connection_identity_status = "unavailable"
    if identity_mapping is not None:
        connection_identity_status = identity_mapping.connection_identity_status.value

    return DesignIdentityLedger(
        document_id=document.id,
        document_name=document.name,
        hdl_module_name=hdl_module.module_name if hdl_module is not None else None,
        component_count=len(document.components),
        mapped_component_count=mapped_component_count,
        connection_identity_status=connection_identity_status,
        unmapped_physical_cell_count=unmapped_physical_cell_count,
        records=records,
    )
