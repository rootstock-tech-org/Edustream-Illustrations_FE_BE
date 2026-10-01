from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.physical.layout import compute_die_bounds, compute_floorplan, compute_pin_positions


def _boxes_overlap(a, b) -> bool:
    return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height


def test_compute_floorplan_places_every_component() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    assert set(placements.keys()) == {c.id for c in document.components}


def test_compute_floorplan_has_no_overlapping_blocks() -> None:
    document = and_gate_document()
    placements = list(compute_floorplan(document).values())

    for i in range(len(placements)):
        for j in range(i + 1, len(placements)):
            assert not _boxes_overlap(placements[i], placements[j])


def test_compute_floorplan_is_deterministic() -> None:
    document = and_gate_document()
    assert compute_floorplan(document) == compute_floorplan(document)


def test_compute_die_bounds_encloses_all_blocks() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    die_width, die_height = compute_die_bounds(placements)

    for placement in placements.values():
        assert placement.x + placement.width <= die_width
        assert placement.y + placement.height <= die_height


def test_layout_handles_hierarchical_document_without_crashing() -> None:
    document = hierarchical_module_document()
    placements = compute_floorplan(document)
    assert set(placements.keys()) == {"top", "and1"}


def test_pin_positions_input_left_output_right() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    positions = compute_pin_positions(document, placements)

    and1_placement = placements["and1"]
    assert positions["and1.a"].x == and1_placement.x
    assert positions["and1.b"].x == and1_placement.x
    assert positions["and1.y"].x == and1_placement.x + and1_placement.width


def test_pin_positions_deterministic_vertical_ordering() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    positions = compute_pin_positions(document, placements)

    assert positions["and1.a"].y < positions["and1.b"].y


def test_compute_pin_positions_is_deterministic() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    assert compute_pin_positions(document, placements) == compute_pin_positions(document, placements)


def test_block_size_grows_with_extra_ports() -> None:
    document = and_gate_document()
    placements = compute_floorplan(document)
    # and1 has 3 ports (a, b, y); in_a has 1 port (out) - and1 should be wider.
    assert placements["and1"].width > placements["in_a"].width
