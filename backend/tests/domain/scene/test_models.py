import pytest
from pydantic import ValidationError

from app.domain.scene.errors import SceneError
from app.domain.scene.models import SceneDocument, SceneObject, SceneResult


def test_scene_object_is_frozen() -> None:
    obj = SceneObject(id="scene_c1", source_component_id="c1", kind="AND", x=0.0, y=0.0, z=0.0, width=40.0, height=40.0, depth=20.0)
    with pytest.raises(ValidationError):
        obj.x = 1.0  # type: ignore[misc]


def test_scene_document_is_frozen() -> None:
    document = SceneDocument(source_document_id="doc_1", source_schema_version="1.0.0")
    with pytest.raises(ValidationError):
        document.source_document_id = "doc_2"  # type: ignore[misc]


def test_scene_document_defaults_to_empty_objects() -> None:
    document = SceneDocument(source_document_id="doc_1", source_schema_version="1.0.0")
    assert document.objects == []


def test_scene_result_defaults() -> None:
    result = SceneResult(is_valid=True)
    assert result.errors == []
    assert result.warnings == []
    assert result.scene is None


def test_scene_error_is_frozen() -> None:
    error = SceneError(code="X", message="m", path="p")
    with pytest.raises(ValidationError):
        error.code = "Y"  # type: ignore[misc]
