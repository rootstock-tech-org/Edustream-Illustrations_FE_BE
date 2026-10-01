"""Standalone GDS-parsing bridge script.

Invoked via subprocess from app.domain.physical_design.gds_reader, running
under a Python interpreter that has the REAL `klayout` package installed
(the isolated LibreLane venv already has it - klayout is a dependency of
LibreLane's own toolchain, never added to this project's own backend venv).
This script never fabricates geometry - every value printed comes directly
from klayout's own parse of the real GDS file.

Usage:
    python3 gds_bridge.py summary <gds_path>
    python3 gds_bridge.py region <gds_path> <layer> <datatype> \
        <min_x_um> <min_y_um> <max_x_um> <max_y_um> <limit>

Prints exactly one JSON object to stdout. On any failure, prints
{"error": "<message>"} instead of raising - the caller (gds_reader.py)
is responsible for turning that into a structured, honest API error.

CRITICAL CORRECTNESS NOTE (found during an independent audit): a real,
placed GDS cell's shapes are almost always defined in a CHILD cell's own
LOCAL coordinate system and placed into the top cell via an instance
(SREF/AREF) with a real translation/rotation/mirror. `RecursiveShapeIterator.
shape()` returns the shape in that LOCAL frame - `it.trans()` is the real
accumulated transform (translation + rotation/mirror) from that local
frame into the top cell's absolute coordinates. Every returned shape's
points MUST be transformed via `it.trans()` before converting to microns,
or every non-flat-top-level shape (i.e. almost all standard-cell-internal
geometry - poly/diff/li1/licon1/mcon/nwell etc.) renders at the WRONG
absolute position (verified: querying two completely different regions
of the die returned byte-identical, wrong coordinates before this fix -
`it.trans()` for one shape was independently confirmed to exactly equal
the real DEF placement offset for `and1/_0_`, 10580,146880 database
units = 10.58,146.88 real microns, cross-checked against previously
DEF-verified data). Only shapes drawn directly/flattened in the top cell
(e.g. much of the real routing metal) happened to look correct without
this fix, since their transform is the identity - this bug was NOT
visible from a routing-only screenshot alone.
"""

from __future__ import annotations

import json
import sys


def _fail(message: str) -> None:
    print(json.dumps({"error": message}))
    sys.exit(0)


def _read_layout(gds_path: str):
    import klayout.db as db

    layout = db.Layout()
    layout.read(gds_path)
    return layout


def _summary(gds_path: str) -> None:
    import time

    start = time.monotonic()
    layout = _read_layout(gds_path)
    top = layout.top_cell()
    if top is None:
        _fail("GDS file has no top cell.")
        return

    dbu = layout.dbu
    bbox = top.bbox()

    layer_infos = layout.layer_infos()
    layers = []
    total_polygons = 0
    total_paths = 0
    total_boxes = 0
    total_texts = 0
    for layer_info in layer_infos:
        layer_index = layout.layer(layer_info)
        shape_count = 0
        it = top.begin_shapes_rec(layer_index)
        while not it.at_end():
            shape = it.shape()
            if shape.is_polygon() or shape.is_simple_polygon():
                total_polygons += 1
            elif shape.is_path():
                total_paths += 1
            elif shape.is_box():
                total_boxes += 1
            elif shape.is_text():
                total_texts += 1
            shape_count += 1
            it.next()
        layers.append(
            {
                "layer": layer_info.layer,
                "datatype": layer_info.datatype,
                "shape_count": shape_count,
            }
        )

    elapsed = time.monotonic() - start

    print(
        json.dumps(
            {
                "dbu_um": dbu,
                "top_cell_name": top.name,
                "cell_count": layout.cells(),
                "bounding_box": {
                    "min_x_um": bbox.left * dbu,
                    "min_y_um": bbox.bottom * dbu,
                    "max_x_um": bbox.right * dbu,
                    "max_y_um": bbox.top * dbu,
                },
                "layers": layers,
                "total_polygon_count": total_polygons,
                "total_path_count": total_paths,
                "total_box_count": total_boxes,
                "total_text_count": total_texts,
                "parse_seconds": elapsed,
            }
        )
    )


def _region(
    gds_path: str,
    layer: int,
    datatype: int,
    min_x_um: float,
    min_y_um: float,
    max_x_um: float,
    max_y_um: float,
    limit: int,
) -> None:
    import klayout.db as db

    layout = _read_layout(gds_path)
    top = layout.top_cell()
    if top is None:
        _fail("GDS file has no top cell.")
        return

    dbu = layout.dbu
    target_layer_info = db.LayerInfo(layer, datatype)
    layer_index = layout.find_layer(target_layer_info)
    if layer_index is None:
        print(
            json.dumps(
                {
                    "layer": layer,
                    "datatype": datatype,
                    "shapes": [],
                    "returned_count": 0,
                    "truncated": False,
                }
            )
        )
        return

    region_box = db.Box(
        int(round(min_x_um / dbu)),
        int(round(min_y_um / dbu)),
        int(round(max_x_um / dbu)),
        int(round(max_y_um / dbu)),
    )

    shapes = []
    truncated = False
    it = layout.begin_shapes_touching(top, layer_index, region_box)
    while not it.at_end():
        if len(shapes) >= limit:
            truncated = True
            break
        shape = it.shape()
        # Real accumulated transform from this shape's own (possibly
        # deeply nested) defining cell into the top cell's absolute
        # coordinate system - REQUIRED for correctness, see module
        # docstring. Never skip this, even for shapes that happen to
        # look "already correct" without it (e.g. an identity transform).
        trans = it.trans()
        if shape.is_box():
            transformed_box = shape.box.transformed(trans)
            points = [
                (transformed_box.left * dbu, transformed_box.bottom * dbu),
                (transformed_box.right * dbu, transformed_box.bottom * dbu),
                (transformed_box.right * dbu, transformed_box.top * dbu),
                (transformed_box.left * dbu, transformed_box.top * dbu),
            ]
            shapes.append({"kind": "box", "points_um": points})
        elif shape.is_polygon() or shape.is_simple_polygon():
            transformed_poly = shape.polygon.transformed(trans)
            points = [(p.x * dbu, p.y * dbu) for p in transformed_poly.each_point_hull()]
            shapes.append({"kind": "polygon", "points_um": points})
        elif shape.is_path():
            transformed_path_polygon = shape.path.polygon().transformed(trans)
            points = [(p.x * dbu, p.y * dbu) for p in transformed_path_polygon.each_point_hull()]
            shapes.append({"kind": "path", "points_um": points})
        it.next()

    print(
        json.dumps(
            {
                "layer": layer,
                "datatype": datatype,
                "shapes": shapes,
                "returned_count": len(shapes),
                "truncated": truncated,
            }
        )
    )


def main() -> None:
    try:
        mode = sys.argv[1]
        gds_path = sys.argv[2]
        if mode == "summary":
            _summary(gds_path)
        elif mode == "region":
            layer = int(sys.argv[3])
            datatype = int(sys.argv[4])
            min_x_um = float(sys.argv[5])
            min_y_um = float(sys.argv[6])
            max_x_um = float(sys.argv[7])
            max_y_um = float(sys.argv[8])
            limit = int(sys.argv[9])
            _region(gds_path, layer, datatype, min_x_um, min_y_um, max_x_um, max_y_um, limit)
        else:
            _fail(f"Unknown mode: {mode}")
    except Exception as exc:  # noqa: BLE001 - this bridge must never raise, only report
        _fail(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
