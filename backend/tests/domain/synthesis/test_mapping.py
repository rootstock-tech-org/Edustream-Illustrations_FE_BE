from app.domain.synthesis.mapping import build_id_mapping


def test_exact_one_to_one_mapping_by_cell_name() -> None:
    netlist = {
        "modules": {
            "m_doc": {
                "cells": {
                    "and1": {"attributes": {}},
                    "or1": {"attributes": {}},
                }
            }
        }
    }

    mapping = build_id_mapping(
        netlist,
        "m_doc",
        top_level_ports={"in_a": "in_a", "out_y": "out_y"},
        gate_instance_ids={"and1": "and1", "or1": "or1"},
    )

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and1"].synthesized_cell_names == ["and1"]
    assert by_id["and1"].note is None
    assert by_id["or1"].synthesized_cell_names == ["or1"]
    assert mapping.unmapped_cell_names == []
    assert mapping.top_level_ports == {"in_a": "in_a", "out_y": "out_y"}


def test_falls_back_to_attribute_when_cell_name_does_not_match() -> None:
    netlist = {
        "modules": {
            "m_doc": {
                "cells": {
                    "$and$design.v:9$1": {"attributes": {"canonical_component_id": "and1"}},
                }
            }
        }
    }

    mapping = build_id_mapping(
        netlist, "m_doc", top_level_ports={}, gate_instance_ids={"and1": "and1"}
    )

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and1"].synthesized_cell_names == ["$and$design.v:9$1"]
    assert "expected cell 'and1' was not found" in (by_id["and1"].note or "")


def test_cell_with_neither_name_nor_attribute_match_is_honestly_unmapped() -> None:
    netlist = {
        "modules": {
            "m_doc": {
                "cells": {
                    "$auto$opt.cc:123$99": {"attributes": {}},
                }
            }
        }
    }

    mapping = build_id_mapping(
        netlist, "m_doc", top_level_ports={}, gate_instance_ids={"and1": "and1"}
    )

    assert mapping.unmapped_cell_names == ["$auto$opt.cc:123$99"]
    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and1"].synthesized_cell_names == []
    assert "was not found" in (by_id["and1"].note or "")


def test_missing_module_in_netlist_reports_everything_as_missing_not_a_crash() -> None:
    mapping = build_id_mapping(
        {"modules": {}}, "m_doc", top_level_ports={}, gate_instance_ids={"and1": "and1"}
    )

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert by_id["and1"].synthesized_cell_names == []
    assert mapping.unmapped_cell_names == []


def test_one_to_many_relationship_is_reported_honestly_never_picks_a_winner() -> None:
    netlist = {
        "modules": {
            "m_doc": {
                "cells": {
                    "and1": {"attributes": {}},
                    "and1_dup": {"attributes": {"canonical_component_id": "and1"}},
                }
            }
        }
    }

    mapping = build_id_mapping(
        netlist, "m_doc", top_level_ports={}, gate_instance_ids={"and1": "and1"}
    )

    by_id = {m.canonical_component_id: m for m in mapping.component_mappings}
    assert set(by_id["and1"].synthesized_cell_names) == {"and1", "and1_dup"}
    assert "one-to-many" in (by_id["and1"].note or "")
