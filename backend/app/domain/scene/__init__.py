"""Scene domain: the smallest backend foundation for a future interactive
3D digital twin. A deterministic, traceable 3D-READY DATA CONTRACT built
from the existing schematic + physical generators - never a renderer,
never a new layout algorithm, never a second source of truth."""

from app.domain.scene.errors import SceneError
from app.domain.scene.generator import generate_scene
from app.domain.scene.models import SceneDocument, SceneObject, SceneResult

__all__ = [
    "SceneError",
    "generate_scene",
    "SceneDocument",
    "SceneObject",
    "SceneResult",
]
