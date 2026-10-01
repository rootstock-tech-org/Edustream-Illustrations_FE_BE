"""A minimal, deterministic, 3D-READY data contract - the smallest
backend foundation for a future interactive 3D digital twin. This is a
DATA CONTRACT, not a renderer: no rendering framework, no camera/
controls, no real PDK geometry.

Field shape matches the existing SchematicComponent/PhysicalBlock
convention exactly: flat x/y/(z)/width/height/(depth) fields, no nested
Position/Size sub-objects (there is no such wrapper type anywhere else in
this codebase, so none is introduced here either).
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.scene.errors import SceneError


class SceneObject(BaseModel):
    """One 3D-ready object, generated 1:1 from exactly one IR Component
    (via the existing PhysicalBlock - see generator.py for why physical,
    not schematic, is the geometry source)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    source_component_id: str
    kind: str
    x: float
    y: float
    z: float
    width: float
    height: float
    depth: float


class SceneDocument(BaseModel):
    """The full generated 3D-ready scene for one IRDocument."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source_document_id: str
    source_schema_version: str
    objects: list[SceneObject] = Field(default_factory=list)


class SceneResult(BaseModel):
    """The deterministic outcome of generate_scene(). No partial/fake
    scene is ever returned when is_valid is False."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    is_valid: bool
    errors: list[SceneError] = Field(default_factory=list)
    warnings: list[SceneError] = Field(default_factory=list)
    scene: SceneDocument | None = None
