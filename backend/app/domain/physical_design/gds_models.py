"""Pydantic contracts for the real GDS/silicon viewer (Step 20 follow-up).

Every value in these models originates directly from klayout's own real
parse of the real GDS artifact produced by Step 19's LibreLane run - never
fabricated, never a DEF-derived approximation. `GdsLayerInfo.known_name`
is the ONE exception worth calling out explicitly: it is looked up from a
small, static, publicly-documented SKY130 PDK GDS layer/datatype naming
table (see `sky130_gds_layers.py`) - a real, independently-verifiable
industry reference, not something derived from or guessed about this
specific file. It is `None` for any layer/datatype pair not in that table
(never a fabricated guess).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class GdsBoundingBox(BaseModel):
    """A real bounding box in microns, converted from real GDS database units."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    min_x_um: float
    min_y_um: float
    max_x_um: float
    max_y_um: float


class GdsLayerInfo(BaseModel):
    """One real (layer, datatype) pair actually present in the GDS file."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    layer: int
    datatype: int
    known_name: str | None = None
    shape_count: int


class GdsSummary(BaseModel):
    """Real, file-derived GDS metadata - always cheap to compute/return,
    regardless of how much raw geometry the file actually contains."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    dbu_um: float
    top_cell_name: str
    cell_count: int
    bounding_box: GdsBoundingBox
    layers: list[GdsLayerInfo] = Field(default_factory=list)
    total_polygon_count: int
    total_path_count: int
    total_box_count: int
    total_text_count: int
    file_size_bytes: int
    parse_seconds: float


class GdsShapeKind(str, Enum):
    POLYGON = "polygon"
    PATH = "path"
    BOX = "box"


class GdsShape(BaseModel):
    """One real shape's outline points, in real microns - never a
    fabricated/fixed-size marker."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    kind: GdsShapeKind
    points_um: list[tuple[float, float]]


class GdsRegionResult(BaseModel):
    """Real geometry for ONE (layer, datatype) within a queried viewport -
    never the whole file at once (a real GDS can have hundreds of
    thousands of shapes). `truncated=True` honestly signals more shapes
    exist in this region beyond `limit` - never silently dropped without
    saying so."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    layer: int
    datatype: int
    queried_region: GdsBoundingBox
    shapes: list[GdsShape] = Field(default_factory=list)
    returned_count: int
    truncated: bool


class GdsReadError(BaseModel):
    """An honest, structured failure - never a fabricated empty result
    disguised as success."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    message: str
