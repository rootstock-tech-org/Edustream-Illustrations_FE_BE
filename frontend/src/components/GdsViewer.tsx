"use client";

import { useEffect, useRef, useState } from "react";
import { getGdsRegion, getGdsSummary, type GdsRegionResult, type GdsSummary } from "@/lib/api";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 520;
const VIEWPORT_DEBOUNCE_MS = 250;

/* A small, fixed, deterministic display-only color palette keyed by
 * layer index (NOT real data - purely cosmetic, same convention as
 * STATUS_COLORS/CLASSIFICATION_COLORS elsewhere in this project). */
const LAYER_COLORS = ["#4fbf6b", "#e0a04f", "#5aa9e6", "#e05555", "#c77dff", "#f4d35e", "#38a3a5", "#f28482"];

interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function layerKey(layer: number, datatype: number): string {
  return `${layer}/${datatype}`;
}

function layerLabel(layer: number, datatype: number, knownName: string | null): string {
  return knownName ? `${knownName} (L${layer}/D${datatype})` : `L${layer}/D${datatype}`;
}

/** Real GDS/Silicon viewer - renders ACTUAL polygon/path/box geometry
 * parsed from the real GDS artifact via the real `klayout` library
 * (backend GET .../gds/summary + .../gds/region), never the DEF
 * placement-origin markers used by PhysicalFloorplanView. Only ONE
 * (layer, datatype)'s real shapes are fetched per visible layer, clipped
 * to the current pan/zoom viewport - a real GDS can have hundreds of
 * thousands of shapes, so the whole file is never requested at once. */
export default function GdsViewer({ jobId }: { jobId: string }) {
  const [summary, setSummary] = useState<GdsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
  const [regionData, setRegionData] = useState<Map<string, GdsRegionResult>>(new Map());
  const [regionError, setRegionError] = useState<string | null>(null);
  const [loadingRegion, setLoadingRegion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragState = useRef<{ dragging: boolean; lastX: number; lastY: number }>({ dragging: false, lastX: 0, lastY: 0 });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a stale (superseded or post-unmount) region fetch
  // applying its result after a NEWER viewport/layer-selection request
  // has already started - incremented on every effect run/unmount, only
  // the fetch matching the CURRENT generation is allowed to update state.
  const regionRequestGeneration = useRef(0);

  // Reset all per-job state during render when jobId changes (React's own
  // documented "adjusting state when a prop changes" pattern) rather than
  // calling setState synchronously at the top of an effect body.
  const [resetForJobId, setResetForJobId] = useState<string | null>(null);
  if (resetForJobId !== jobId) {
    setResetForJobId(jobId);
    setLoadingSummary(true);
    setSummaryError(null);
    setSummary(null);
    setViewport(null);
    setVisibleLayers(new Set());
    setRegionData(new Map());
  }

  useEffect(() => {
    let cancelled = false;
    getGdsSummary(jobId)
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
        setViewport({
          minX: result.bounding_box.min_x_um,
          minY: result.bounding_box.min_y_um,
          maxX: result.bounding_box.max_x_um,
          maxY: result.bounding_box.max_y_um,
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setSummaryError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
      regionRequestGeneration.current += 1;
    };
  }, [jobId]);

  // Debounced real-geometry fetch whenever the viewport or the set of
  // visible layers changes - never fires on every intermediate pan/zoom
  // frame.
  useEffect(() => {
    if (!viewport || visibleLayers.size === 0) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    regionRequestGeneration.current += 1;
    const thisGeneration = regionRequestGeneration.current;
    debounceTimer.current = setTimeout(() => {
      setLoadingRegion(true);
      setRegionError(null);
      const keys = Array.from(visibleLayers);
      Promise.all(
        keys.map(async (key) => {
          const [layerStr, datatypeStr] = key.split("/");
          const result = await getGdsRegion(jobId, {
            layer: Number(layerStr),
            datatype: Number(datatypeStr),
            min_x_um: viewport.minX,
            min_y_um: viewport.minY,
            max_x_um: viewport.maxX,
            max_y_um: viewport.maxY,
          });
          return [key, result] as const;
        })
      )
        .then((entries) => {
          // A NEWER viewport/layer change (or unmount) may have started
          // a different request while this one was in flight - never let
          // a stale response overwrite fresher state.
          if (regionRequestGeneration.current !== thisGeneration) return;
          setRegionData(new Map(entries));
        })
        .catch((err: unknown) => {
          if (regionRequestGeneration.current !== thisGeneration) return;
          setRegionError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (regionRequestGeneration.current === thisGeneration) setLoadingRegion(false);
        });
    }, VIEWPORT_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [viewport, visibleLayers, jobId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const spanX = viewport.maxX - viewport.minX || 1;
    const spanY = viewport.maxY - viewport.minY || 1;

    const toCanvas = (x: number, y: number): [number, number] => {
      const px = ((x - viewport.minX) / spanX) * CANVAS_WIDTH;
      const py = CANVAS_HEIGHT - ((y - viewport.minY) / spanY) * CANVAS_HEIGHT;
      return [px, py];
    };

    let colorIndex = 0;
    for (const [key, region] of regionData.entries()) {
      const color = LAYER_COLORS[colorIndex % LAYER_COLORS.length];
      colorIndex += 1;
      if (!visibleLayers.has(key)) continue;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      for (const shape of region.shapes) {
        if (shape.points_um.length < 2) continue;
        ctx.beginPath();
        const [startX, startY] = toCanvas(shape.points_um[0][0], shape.points_um[0][1]);
        ctx.moveTo(startX, startY);
        for (const [x, y] of shape.points_um.slice(1)) {
          const [px, py] = toCanvas(x, y);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }, [regionData, viewport, visibleLayers]);

  function toggleLayer(key: string) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetView() {
    if (!summary) return;
    setViewport({
      minX: summary.bounding_box.min_x_um,
      minY: summary.bounding_box.min_y_um,
      maxX: summary.bounding_box.max_x_um,
      maxY: summary.bounding_box.max_y_um,
    });
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!viewport) return;
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const spanX = (viewport.maxX - viewport.minX) * zoomFactor;
    const spanY = (viewport.maxY - viewport.minY) * zoomFactor;
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorFracX = (e.clientX - rect.left) / rect.width;
    const cursorFracY = 1 - (e.clientY - rect.top) / rect.height;
    const cursorX = viewport.minX + cursorFracX * (viewport.maxX - viewport.minX);
    const cursorY = viewport.minY + cursorFracY * (viewport.maxY - viewport.minY);
    setViewport({
      minX: cursorX - cursorFracX * spanX,
      minY: cursorY - cursorFracY * spanY,
      maxX: cursorX + (1 - cursorFracX) * spanX,
      maxY: cursorY + (1 - cursorFracY) * spanY,
    });
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragState.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragState.current.dragging || !viewport) return;
    const dxPixels = e.clientX - dragState.current.lastX;
    const dyPixels = e.clientY - dragState.current.lastY;
    dragState.current.lastX = e.clientX;
    dragState.current.lastY = e.clientY;
    const spanX = viewport.maxX - viewport.minX;
    const spanY = viewport.maxY - viewport.minY;
    const dx = -(dxPixels / CANVAS_WIDTH) * spanX;
    const dy = (dyPixels / CANVAS_HEIGHT) * spanY;
    setViewport({ minX: viewport.minX + dx, minY: viewport.minY + dy, maxX: viewport.maxX + dx, maxY: viewport.maxY + dy });
  }

  function handleMouseUp() {
    dragState.current.dragging = false;
  }

  if (loadingSummary) {
    return <p data-testid="gds-viewer-loading">Loading real GDS metadata...</p>;
  }

  if (summaryError) {
    return (
      <p style={{ color: "#e05555" }} data-testid="gds-viewer-error">
        Error loading real GDS data: {summaryError}
      </p>
    );
  }

  if (!summary) return null;

  const anyTruncated = Array.from(regionData.values()).some((r) => r.truncated);

  return (
    <div style={{ marginTop: "1rem", border: "1px solid #333", padding: "0.75rem" }} data-testid="gds-viewer">
      <h3 style={{ fontSize: "0.9rem" }}>Real GDS / Silicon Viewer (klayout-parsed, not the DEF floorplan above)</h3>
      <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
        Real cell &quot;{summary.top_cell_name}&quot; - {summary.cell_count} cells, {summary.total_box_count} real boxes /{" "}
        {summary.total_polygon_count} real polygons / {summary.total_path_count} real paths across{" "}
        {summary.layers.length} real GDS layers. Die {(summary.bounding_box.max_x_um - summary.bounding_box.min_x_um).toFixed(1)} x{" "}
        {(summary.bounding_box.max_y_um - summary.bounding_box.min_y_um).toFixed(1)} um.
      </p>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ maxHeight: CANVAS_HEIGHT, overflowY: "auto", minWidth: "200px" }}>
          <p style={{ fontSize: "0.75rem", opacity: 0.7 }}>Real layers (select to view real geometry):</p>
          {summary.layers
            .slice()
            .sort((a, b) => b.shape_count - a.shape_count)
            .map((layer) => {
              const key = layerKey(layer.layer, layer.datatype);
              return (
                <label key={key} style={{ display: "block", fontSize: "0.75rem" }}>
                  <input type="checkbox" checked={visibleLayers.has(key)} onChange={() => toggleLayer(key)} />{" "}
                  {layerLabel(layer.layer, layer.datatype, layer.known_name)} ({layer.shape_count})
                </label>
              );
            })}
        </div>

        <div>
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            style={{ background: "#0a0a0a", border: "1px solid #444", cursor: "grab" }}
            data-testid="gds-viewer-canvas"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div style={{ marginTop: "0.4rem" }}>
            <button type="button" onClick={resetView} style={{ fontSize: "0.75rem" }}>
              Reset view
            </button>
            {loadingRegion && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>Loading real geometry...</span>}
          </div>
          {regionError && (
            <p style={{ color: "#e05555", fontSize: "0.75rem" }} data-testid="gds-viewer-region-error">
              Error loading real geometry: {regionError}
            </p>
          )}
          {anyTruncated && (
            <p style={{ fontSize: "0.7rem", opacity: 0.7 }}>
              Some visible layers have more real shapes in this view than the per-request limit - zoom in for full detail.
              Scroll to zoom, drag to pan - a real viewport query is issued for each visible layer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
