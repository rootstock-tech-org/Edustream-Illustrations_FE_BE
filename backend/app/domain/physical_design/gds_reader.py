"""Real GDS parsing via a subprocess bridge into the isolated LibreLane
venv, which already has the real `klayout` package installed (see
`backend/scripts/gds_bridge.py`'s own docstring for why this indirection
exists rather than adding `klayout` as a new dependency of this project's
own backend venv).

Every function here either returns a real, file-derived result or a
structured `GdsReadError` - never raises for an expected failure (missing
artifact, parser unavailable, malformed output) and never fabricates a
substitute result.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from app.domain.physical_design.gds_models import (
    GdsBoundingBox,
    GdsLayerInfo,
    GdsReadError,
    GdsRegionResult,
    GdsShape,
    GdsSummary,
)
from app.domain.physical_design.sky130_gds_layers import known_layer_name

_BRIDGE_SCRIPT = Path(__file__).resolve().parent.parent.parent.parent / "scripts" / "gds_bridge.py"


def _resolve_python_binary(librelane_binary: str, configured: str) -> str:
    """Empty `configured` means: derive python3 from librelane_binary's
    own venv directory (sibling binary, same venv) - never hardcoded."""

    if configured:
        return configured
    return str(Path(librelane_binary).resolve().parent / "python3")


def _run_bridge(args: list[str], *, python_binary: str, timeout_seconds: float) -> dict | GdsReadError:
    try:
        result = subprocess.run(
            [python_binary, str(_BRIDGE_SCRIPT), *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except FileNotFoundError:
        return GdsReadError(code="GDS_PARSER_NOT_AVAILABLE", message=f"Python executable not found at '{python_binary}'.")
    except subprocess.TimeoutExpired:
        return GdsReadError(code="GDS_PARSE_TIMED_OUT", message=f"GDS parsing did not complete within {timeout_seconds}s.")

    if result.returncode != 0 or not result.stdout.strip():
        return GdsReadError(
            code="GDS_PARSE_FAILED",
            message=(result.stderr or result.stdout or "The GDS parser subprocess exited with no output.").strip()[:2000],
        )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return GdsReadError(code="GDS_PARSE_FAILED", message="The GDS parser subprocess returned malformed output.")

    if "error" in payload:
        return GdsReadError(code="GDS_PARSE_FAILED", message=str(payload["error"]))

    return payload


def read_gds_summary(
    gds_path: Path,
    *,
    librelane_binary: str,
    python_binary: str,
    timeout_seconds: float,
) -> GdsSummary | GdsReadError:
    if not gds_path.is_file():
        return GdsReadError(code="GDS_ARTIFACT_NOT_FOUND", message=f"No GDS file at '{gds_path}'.")

    resolved_python = _resolve_python_binary(librelane_binary, python_binary)
    payload = _run_bridge(["summary", str(gds_path)], python_binary=resolved_python, timeout_seconds=timeout_seconds)
    if isinstance(payload, GdsReadError):
        return payload

    # The bridge script is a separate process (a different Python/klayout
    # version could exist on a future machine) - a valid-JSON-but-
    # unexpected-shape payload must become an honest structured error,
    # never an unhandled crash (found during an independent audit: a
    # payload missing an expected key previously propagated a raw
    # KeyError all the way to an unhandled 500).
    try:
        layers = [
            GdsLayerInfo(
                layer=layer["layer"],
                datatype=layer["datatype"],
                known_name=known_layer_name(layer["layer"], layer["datatype"]),
                shape_count=layer["shape_count"],
            )
            for layer in payload["layers"]
        ]

        return GdsSummary(
            dbu_um=payload["dbu_um"],
            top_cell_name=payload["top_cell_name"],
            cell_count=payload["cell_count"],
            bounding_box=GdsBoundingBox(**payload["bounding_box"]),
            layers=layers,
            total_polygon_count=payload["total_polygon_count"],
            total_path_count=payload["total_path_count"],
            total_box_count=payload["total_box_count"],
            total_text_count=payload["total_text_count"],
            file_size_bytes=gds_path.stat().st_size,
            parse_seconds=payload["parse_seconds"],
        )
    except (KeyError, TypeError, ValueError) as exc:
        return GdsReadError(
            code="GDS_PARSE_FAILED",
            message=f"The GDS parser subprocess returned an unexpected payload shape: {type(exc).__name__}: {exc}",
        )


def read_gds_region(
    gds_path: Path,
    *,
    layer: int,
    datatype: int,
    min_x_um: float,
    min_y_um: float,
    max_x_um: float,
    max_y_um: float,
    limit: int,
    librelane_binary: str,
    python_binary: str,
    timeout_seconds: float,
) -> GdsRegionResult | GdsReadError:
    if not gds_path.is_file():
        return GdsReadError(code="GDS_ARTIFACT_NOT_FOUND", message=f"No GDS file at '{gds_path}'.")

    resolved_python = _resolve_python_binary(librelane_binary, python_binary)
    payload = _run_bridge(
        [
            "region",
            str(gds_path),
            str(layer),
            str(datatype),
            str(min_x_um),
            str(min_y_um),
            str(max_x_um),
            str(max_y_um),
            str(limit),
        ],
        python_binary=resolved_python,
        timeout_seconds=timeout_seconds,
    )
    if isinstance(payload, GdsReadError):
        return payload

    try:
        shapes = [
            GdsShape(kind=shape["kind"], points_um=[tuple(p) for p in shape["points_um"]]) for shape in payload["shapes"]
        ]

        return GdsRegionResult(
            layer=payload["layer"],
            datatype=payload["datatype"],
            queried_region=GdsBoundingBox(min_x_um=min_x_um, min_y_um=min_y_um, max_x_um=max_x_um, max_y_um=max_y_um),
            shapes=shapes,
            returned_count=payload["returned_count"],
            truncated=payload["truncated"],
        )
    except (KeyError, TypeError, ValueError) as exc:
        return GdsReadError(
            code="GDS_PARSE_FAILED",
            message=f"The GDS parser subprocess returned an unexpected payload shape: {type(exc).__name__}: {exc}",
        )
