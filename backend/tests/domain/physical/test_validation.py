from app.domain.ir.models import PortDirection
from app.domain.physical.models import PhysicalBlock, PhysicalDocument, PhysicalEndpoint, PhysicalNet, PhysicalPin
from app.domain.physical.validation import validate_physical_document


def _block(id_: str, x: float, y: float, width: float = 40.0, height: float = 40.0) -> PhysicalBlock:
    return PhysicalBlock(id=id_, source_component_id=id_, kind="AND", name=id_, x=x, y=y, width=width, height=height, area=width * height)


def test_valid_document_passes() -> None:
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=200.0, die_height=100.0,
        blocks=[_block("phys_a", 0.0, 0.0), _block("phys_b", 60.0, 0.0)],
    )
    result = validate_physical_document(document)
    assert result.is_valid
    assert result.errors == []


def test_block_out_of_die_bounds_is_rejected() -> None:
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=50.0, die_height=50.0,
        blocks=[_block("phys_a", 0.0, 0.0, width=100.0, height=40.0)],
    )
    result = validate_physical_document(document)
    assert not result.is_valid
    assert any(error.code == "BLOCK_OUT_OF_DIE_BOUNDS" for error in result.errors)


def test_negative_block_position_is_rejected() -> None:
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=100.0, die_height=100.0,
        blocks=[_block("phys_a", -10.0, 0.0)],
    )
    result = validate_physical_document(document)
    assert not result.is_valid
    assert any(error.code == "BLOCK_OUT_OF_DIE_BOUNDS" for error in result.errors)


def test_overlapping_blocks_are_rejected() -> None:
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=200.0, die_height=100.0,
        blocks=[_block("phys_a", 0.0, 0.0), _block("phys_b", 10.0, 0.0)],
    )
    result = validate_physical_document(document)
    assert not result.is_valid
    assert any(error.code == "BLOCK_OVERLAP" for error in result.errors)


def test_dangling_net_block_reference_is_rejected() -> None:
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=200.0, die_height=100.0,
        blocks=[_block("phys_a", 0.0, 0.0)],
        nets=[
            PhysicalNet(
                id="net_1", source_connection_id="conn_1",
                source=PhysicalEndpoint(block_id="phys_a", pin_id="pin_a.out", source_component_id="a", source_port_id="a.out"),
                target=PhysicalEndpoint(block_id="phys_ghost", pin_id="pin_ghost.in", source_component_id="ghost", source_port_id="ghost.in"),
            )
        ],
    )
    result = validate_physical_document(document)
    assert not result.is_valid
    assert any(error.code == "DANGLING_NET_PIN_REFERENCE" for error in result.errors)


def test_dangling_net_pin_reference_is_rejected() -> None:
    pin = PhysicalPin(id="pin_a.out", source_port_id="a.out", name="out", direction=PortDirection.OUTPUT, x=40.0, y=8.0)
    block = PhysicalBlock(id="phys_a", source_component_id="a", kind="input", name="A", x=0.0, y=0.0, width=40.0, height=40.0, area=1600.0, pins=[pin])
    document = PhysicalDocument(
        source_document_id="doc_1", source_schema_version="1.0.0",
        die_width=200.0, die_height=100.0,
        blocks=[block],
        nets=[
            PhysicalNet(
                id="net_1", source_connection_id="conn_1",
                source=PhysicalEndpoint(block_id="phys_a", pin_id="pin_a.does_not_exist", source_component_id="a", source_port_id="a.does_not_exist"),
                target=PhysicalEndpoint(block_id="phys_a", pin_id="pin_a.out", source_component_id="a", source_port_id="a.out"),
            )
        ],
    )
    result = validate_physical_document(document)
    assert not result.is_valid
    assert any(error.code == "DANGLING_NET_PIN_REFERENCE" for error in result.errors)
