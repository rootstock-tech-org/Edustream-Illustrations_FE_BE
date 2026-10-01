from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.schematic.layout import compute_layout, compute_port_positions


def _boxes_overlap(a, b) -> bool:
    return a.x < b.x + b.width and b.x < a.x + a.width and a.y < b.y + b.height and b.y < a.y + a.height


def test_and_gate_places_left_to_right() -> None:
    document = and_gate_document()
    placements = compute_layout(document)

    assert placements["in_a"].x == placements["in_b"].x
    assert placements["and1"].x > placements["in_a"].x
    assert placements["out_y"].x > placements["and1"].x
    # in_a/in_b share a column - deterministic distinct rows.
    assert placements["in_a"].y != placements["in_b"].y


def test_layout_has_no_overlapping_component_boxes() -> None:
    document = and_gate_document()
    placements = list(compute_layout(document).values())

    for i in range(len(placements)):
        for j in range(i + 1, len(placements)):
            assert not _boxes_overlap(placements[i], placements[j])


def test_compute_layout_is_deterministic() -> None:
    document = and_gate_document()
    assert compute_layout(document) == compute_layout(document)


def test_layout_handles_hierarchical_boundary_without_crashing() -> None:
    document = hierarchical_module_document()
    placements = compute_layout(document)

    assert set(placements.keys()) == {"top", "and1"}
    assert not _boxes_overlap(placements["top"], placements["and1"])


def test_port_positions_input_left_output_right() -> None:
    document = and_gate_document()
    placements = compute_layout(document)
    positions = compute_port_positions(document, placements)

    and1_placement = placements["and1"]
    assert positions["and1.a"].x == and1_placement.x
    assert positions["and1.b"].x == and1_placement.x
    assert positions["and1.y"].x == and1_placement.x + and1_placement.width


def test_port_positions_deterministic_vertical_ordering() -> None:
    document = and_gate_document()
    placements = compute_layout(document)
    positions = compute_port_positions(document, placements)

    # and1.a sorts before and1.b - deterministic id-order stacking.
    assert positions["and1.a"].y < positions["and1.b"].y


def test_compute_port_positions_is_deterministic() -> None:
    document = and_gate_document()
    placements = compute_layout(document)
    assert compute_port_positions(document, placements) == compute_port_positions(document, placements)
