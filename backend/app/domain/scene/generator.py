"""generate_scene(document) -> SceneResult - the single public entry
point for Step 9.

ARCHITECTURAL DECISION (documented per explicit instruction to surface
rather than silently resolve any contract ambiguity): this generator
calls BOTH existing view generators -
app.domain.schematic.generator.generate_schematic() AND
app.domain.physical.generator.generate_physical_layout() - but they
compute geometry in two genuinely DIFFERENT, mutually-incompatible 2D
coordinate spaces (schematic: topological dataflow layering; physical:
shelf-packing floorplan). Mixing raw coordinates from both into one
"physical" 3D scene would be geometrically inconsistent. Physical layout
is used as the sole geometry source for SceneObject position/size (it is
the more spatially-meaningful of the two - a floorplan, not a logic
diagram - and is literally the "physical/silicon" representation this
"digital twin" scene is meant to project into 3D). The schematic result
is still fully computed and its is_valid/errors/warnings are folded in as
a defensive cross-check (both wrap the identical guardrails call for the
same document, so they must always agree - a divergence would itself be
a real bug worth surfacing, never silently ignored). Neither generator's
internal layout logic is reimplemented here.
"""

from __future__ import annotations

from app.domain.ir.models import IRDocument
from app.domain.physical.errors import PhysicalError
from app.domain.physical.generator import generate_physical_layout
from app.domain.physical.models import PhysicalDocument
from app.domain.scene.errors import SceneError
from app.domain.scene.models import SceneDocument, SceneObject, SceneResult
from app.domain.schematic.errors import SchematicError
from app.domain.schematic.generator import generate_schematic

# Illustrative-only constants: a 3D digital twin needs SOME z-axis
# extent, but this codebase has no real PDK/process Z-thickness data
# (see app.domain.physical.models' own docstring) - every object sits on
# the same deterministic baseline plane and gets the same fixed,
# clearly-illustrative extrusion depth. Never claims to be real geometry.
SCENE_BASELINE_Z = 0.0
SCENE_EXTRUSION_DEPTH = 20.0


def generate_scene(document: IRDocument) -> SceneResult:
    """Validate via both existing generators, then deterministically
    project the physical floorplan into a minimal 3D-ready SceneDocument.
    Returns a structured failure (scene=None) - never a partial scene -
    whenever either generator rejects the IR."""

    schematic_result = generate_schematic(document)
    physical_result = generate_physical_layout(document)

    errors = _merge_errors(schematic_result.errors, physical_result.errors)
    warnings = _merge_errors(schematic_result.warnings, physical_result.warnings)

    if schematic_result.is_valid != physical_result.is_valid:
        # Should be unreachable - both wrap the same run_guardrails() call
        # on the same document - but never silently trust an assumption.
        errors.append(
            SceneError(
                code="SCENE_SOURCE_MISMATCH",
                message="Schematic and physical generation disagreed on IR validity.",
                path="scene",
            )
        )
        return SceneResult(is_valid=False, errors=errors, warnings=warnings, scene=None)

    if not physical_result.is_valid or physical_result.physical is None:
        return SceneResult(is_valid=False, errors=errors, warnings=warnings, scene=None)

    scene = _build_scene(physical_result.physical)

    return SceneResult(is_valid=True, errors=[], warnings=warnings, scene=scene)


def _merge_errors(
    first: list[SchematicError],
    second: list[PhysicalError],
) -> list[SceneError]:
    """Union two issue lists (schematic's + physical's own error/warning
    shape, both code/message/path) into SceneError, deduplicated by
    (code, message, path). In practice they are always identical (see
    module docstring) - this is a defensive merge, not a data source."""

    merged: dict[tuple[str, str, str], SceneError] = {}
    for issue in list(first) + list(second):
        issue_error = SceneError(code=issue.code, message=issue.message, path=issue.path)
        merged[(issue_error.code, issue_error.message, issue_error.path)] = issue_error
    return list(merged.values())


def _build_scene(physical: PhysicalDocument) -> SceneDocument:
    objects = [
        SceneObject(
            id=f"scene_{block.source_component_id}",
            source_component_id=block.source_component_id,
            kind=block.kind,
            x=block.x,
            y=block.y,
            z=SCENE_BASELINE_Z,
            width=block.width,
            height=block.height,
            depth=SCENE_EXTRUSION_DEPTH,
        )
        for block in sorted(physical.blocks, key=lambda block: block.source_component_id)
    ]

    return SceneDocument(
        source_document_id=physical.source_document_id,
        source_schema_version=physical.source_schema_version,
        objects=objects,
    )
