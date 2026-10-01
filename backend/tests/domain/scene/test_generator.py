from datetime import datetime, timezone

from app.domain.ir.examples import and_gate_document, hierarchical_module_document
from app.domain.ir.models import (
    Annotation,
    Component,
    Connection,
    ConnectionEndpoint,
    CURRENT_SCHEMA_VERSION,
    IRDocument,
    Port,
    PortDirection,
    Provenance,
)
from app.domain.scene.generator import generate_scene

_CREATED_AT = datetime(2026, 9, 14, tzinfo=timezone.utc)


def _provenance() -> Provenance:
    return Provenance(source="manual", created_at=_CREATED_AT)


def _dangling_connection_document() -> IRDocument:
    in_a = Component(id="in_a", kind="input", name="A", ports=[Port(id="in_a.out", name="out", direction=PortDirection.OUTPUT, width=1)])
    not1 = Component(id="not1", kind="NOT", name="NOT1", ports=[Port(id="not1.a", name="a", direction=PortDirection.INPUT, width=1)])

    return IRDocument(
        id="doc_dangling",
        schema_version=CURRENT_SCHEMA_VERSION,
        design_version="1",
        name="Dangling",
        components=[in_a, not1],
        connections=[
            Connection(id="conn_1", source=ConnectionEndpoint(component_id="in_a", port_id="in_a.out"), target=ConnectionEndpoint(component_id="not1", port_id="not1.does_not_exist")),
        ],
        root_component_ids=["in_a", "not1"],
        provenance=_provenance(),
    )


# 1: valid AND-gate scene generation
def test_and_gate_generates_successfully() -> None:
    result = generate_scene(and_gate_document())

    assert result.is_valid
    assert result.errors == []
    assert result.scene is not None
    assert len(result.scene.objects) == 4


# 2: hierarchical IR generation
def test_hierarchical_document_generates_all_objects() -> None:
    document = hierarchical_module_document()
    result = generate_scene(document)

    assert result.is_valid
    assert result.scene is not None
    assert len(result.scene.objects) == len(document.components) == 2


# 3: invalid/dangling IR -> structured error + scene=None
def test_invalid_ir_does_not_generate_scene() -> None:
    result = generate_scene(_dangling_connection_document())

    assert not result.is_valid
    assert result.scene is None
    assert any(error.code == "MISSING_TARGET_PORT" for error in result.errors)


# 7: traceability to actual IR component IDs
def test_every_scene_object_traces_to_a_real_ir_component() -> None:
    document = and_gate_document()
    result = generate_scene(document)
    assert result.scene is not None

    real_component_ids = {c.id for c in document.components}
    for scene_object in result.scene.objects:
        assert scene_object.source_component_id in real_component_ids
        assert scene_object.id == f"scene_{scene_object.source_component_id}"


# 8: warning propagation
def test_guardrail_warning_propagates_without_blocking_generation() -> None:
    document = and_gate_document().model_copy(
        update={"annotations": [Annotation(id="note_1", text="stray", target_id="does_not_exist")]}
    )

    result = generate_scene(document)

    assert result.is_valid
    assert result.scene is not None
    assert any(warning.code == "DANGLING_ANNOTATION_REFERENCE" for warning in result.warnings)


# 6: deterministic repeated generation
def test_generation_is_deterministic() -> None:
    first = generate_scene(and_gate_document())
    second = generate_scene(and_gate_document())
    assert first == second


# 9: component ordering independence (both underlying generators already
# sort by id internally, so this holds without altering either contract)
def test_component_order_independence() -> None:
    document = and_gate_document()
    reversed_document = document.model_copy(update={"components": list(reversed(document.components))})

    original = generate_scene(document)
    reversed_result = generate_scene(reversed_document)

    assert original.scene is not None and reversed_result.scene is not None
    assert original.scene.objects == reversed_result.scene.objects


def test_original_document_is_not_mutated() -> None:
    document = and_gate_document()
    snapshot = document.model_copy(deep=True)

    generate_scene(document)

    assert document == snapshot


# 11: response/model contract - z baseline and fixed illustrative depth
def test_scene_objects_use_documented_z_baseline_and_depth() -> None:
    result = generate_scene(and_gate_document())
    assert result.scene is not None

    for scene_object in result.scene.objects:
        assert scene_object.z == 0.0
        assert scene_object.depth == 20.0


def test_scene_preserves_existing_xy_from_physical_layout() -> None:
    from app.domain.physical.generator import generate_physical_layout

    document = and_gate_document()
    scene_result = generate_scene(document)
    physical_result = generate_physical_layout(document)
    assert scene_result.scene is not None and physical_result.physical is not None

    physical_by_source = {b.source_component_id: b for b in physical_result.physical.blocks}
    for scene_object in scene_result.scene.objects:
        block = physical_by_source[scene_object.source_component_id]
        assert scene_object.x == block.x
        assert scene_object.y == block.y
        assert scene_object.width == block.width
        assert scene_object.height == block.height
