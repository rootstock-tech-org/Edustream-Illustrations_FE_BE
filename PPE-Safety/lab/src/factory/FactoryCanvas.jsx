import { useCallback, useRef, useState } from "react";

import { read } from "../engine/legibility.js";
import { KINDS, clamp01 } from "../engine/world.js";
import { VIEW, ZONE_LOOK } from "../floor/floorLook.js";
import { TONES, checkingText, labelFor } from "../floor/labels.js";
import { ThingArt } from "./objects.jsx";
import { DEFAULT_DETECTION_BOX, DEFAULT_HIT, DETECTION_BOX, HIT_AREA } from "./sizes.js";

/**
 * Factory Floor A as Camera 01 sees it: a high-angle view of a concrete
 * floor with its racking, machines and markings, and over it the overlay a
 * CCTV operator's screen would draw — a detection box and label on every
 * tracked thing, the marked areas, and the camera's field of view.
 *
 * One SVG in a fixed 1000×620 coordinate space, scaled to whatever width it
 * is given. Positions come from the world as fractions and are multiplied
 * into that space here.
 *
 * `mode` picks what is drawn:
 *   "full"    the operator view (default)
 *   "frame"   the raw picture — floor and things, no overlay; the "Camera
 *             Frame" thumbnail in the pipeline
 *   "detect"  boxes with the model's class and score, nothing else; the
 *             "Object Detection" thumbnail
 */

const STATIC_KINDS = new Set([KINDS.CAMERA, KINDS.DOOR]);

/** Where the camera's lens is, for the cone — the unit sits in the corner. */
function cameraLens(world) {
  const camera = world.things.find((thing) => thing.kind === KINDS.CAMERA);
  if (!camera) return null;
  return [camera.x * VIEW.width + 14, camera.y * VIEW.height + 10];
}

export default function FactoryCanvas({
  world,
  selectedId = null,
  onSelect,
  onMove,
  onActivate,
  drawing = null,
  draftPoints = [],
  onDraftPoint,
  result = null,
  conditions = { light: 1, blur: 0, compression: 0 },
  bars,
  readOnly = false,
  mode = "full",
  pulseId = null,
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const gestureOnThing = useRef(false);
  const [hoverPoint, setHoverPoint] = useState(null);

  const interactive = !readOnly && mode === "full";
  // Live off the conditions, not off the last frame the clock advanced: a
  // paused floor still darkens on screen, and the overlay has to admit it
  // has stopped seeing rather than leave yesterday's verdicts standing.
  const reading = read(conditions);
  const readable = reading.readable;
  const findings = result?.findings ?? [];
  const detections = result?.detections ?? [];
  const zoneFindings = findings.filter((finding) => finding.kind === "zone");
  const findingFor = (id) => findings.find((finding) => finding.id === id) ?? null;
  const detectionFor = (id) => detections.find((detection) => detection.id === id) ?? null;

  const pointToFraction = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    };
  }, []);

  const startDrag = (event, thing) => {
    if (drawing || !interactive) return;
    event.stopPropagation();
    gestureOnThing.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const at = pointToFraction(event);
    dragRef.current = at
      ? { id: thing.id, kind: thing.kind, dx: thing.x - at.x, dy: thing.y - at.y, moved: false }
      : null;
    onSelect?.(thing.id);
  };

  const duringDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || STATIC_KINDS.has(drag.kind)) return;
    const at = pointToFraction(event);
    if (!at) return;
    drag.moved = true;
    onMove?.(drag.id, at.x + drag.dx, at.y + drag.dy);
  };

  const endDrag = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) onActivate?.(drag.id);
  };

  const onFloorClick = (event) => {
    if (!interactive) return;
    if (drawing) {
      const at = pointToFraction(event);
      if (at) onDraftPoint?.([at.x, at.y]);
      return;
    }
    if (gestureOnThing.current) {
      gestureOnThing.current = false;
      return;
    }
    onSelect?.(null);
  };

  const px = (fraction, axis) => fraction * (axis === "x" ? VIEW.width : VIEW.height);
  const lens = cameraLens(world);
  const light = conditions.light ?? 1;
  const blur = conditions.blur ?? 0;
  const squeeze = conditions.compression ?? 0;

  const draftPath = draftPoints.length
    ? draftPoints.map(([x, y]) => `${px(x, "x")},${px(y, "y")}`).join(" ")
    : null;

  return (
    <svg
      ref={svgRef}
      data-testid="factory-floor"
      role="group"
      aria-label={`Factory floor: ${world.things.length} things, ${world.zones.length} marked areas`}
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className={[
        "block w-full touch-none select-none",
        drawing ? "cursor-crosshair" : "cursor-default",
        readOnly ? "pointer-events-none" : "",
      ].join(" ")}
      style={{ background: "var(--floor-bg)" }}
      onClick={onFloorClick}
      onPointerDown={() => {
        gestureOnThing.current = false;
      }}
      onPointerMove={(event) => {
        if (!drawing) return;
        setHoverPoint(pointToFraction(event));
      }}
      onPointerLeave={() => setHoverPoint(null)}
    >
      <defs>
        <filter id="concrete" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.22" />
          </feComponentTransfer>
        </filter>
        <filter id="stain" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <radialGradient id="vignette" cx="50%" cy="45%" r="72%">
          <stop offset="55%" style={{ stopColor: "var(--floor-vignette)" }} stopOpacity="0" />
          <stop offset="100%" style={{ stopColor: "var(--floor-vignette)", stopOpacity: "var(--floor-vignette-alpha)" }} />
        </radialGradient>
        <linearGradient id="cone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.03" />
        </linearGradient>
        <pattern id="hazard" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="16" fill="#FACC15" />
          <rect x="8" width="8" height="16" fill="#111827" />
        </pattern>
        <pattern id="blocks" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="none" stroke="#000" strokeWidth="1" />
          <rect width="6" height="6" fill="#000" opacity="0.5" />
        </pattern>
      </defs>

      {/* ---- the scene: floor, walls, fixtures, things ---- */}
      <g style={blur > 0 ? { filter: `blur(${(blur * 4).toFixed(1)}px)` } : undefined}>
        <rect width={VIEW.width} height={VIEW.height} style={{ fill: "var(--floor-slab)" }} />
        <rect width={VIEW.width} height={VIEW.height} filter="url(#concrete)" />
        {/* expansion joints */}
        <g style={{ stroke: "var(--floor-joint)" }} strokeWidth="1.2" opacity="0.8">
          {[200, 400, 600, 800].map((x) => <line key={`jx${x}`} x1={x} y1="0" x2={x} y2={VIEW.height} />)}
          {[210, 420].map((y) => <line key={`jy${y}`} x1="0" y1={y} x2={VIEW.width} y2={y} />)}
        </g>
        {/* stains and tyre marks */}
        <g filter="url(#stain)" opacity="0.35">
          <ellipse cx="560" cy="330" rx="90" ry="40" style={{ fill: "var(--floor-stain)" }} />
          <ellipse cx="300" cy="180" rx="60" ry="26" style={{ fill: "var(--floor-stain)" }} />
          <ellipse cx="820" cy="560" rx="80" ry="24" style={{ fill: "var(--floor-stain)" }} />
        </g>
        <g style={{ stroke: "var(--floor-joint)" }} strokeWidth="5" fill="none" opacity="0.35" strokeLinecap="round">
          <path d="M430 140 C 520 170, 600 160, 700 210" />
          <path d="M440 152 C 530 182, 610 172, 710 222" />
        </g>
        <rect width={VIEW.width} height={VIEW.height} fill="url(#vignette)" />

        {/* walls */}
        <rect x="4" y="4" width={VIEW.width - 8} height={VIEW.height - 8} fill="none" style={{ stroke: "var(--floor-wall)" }} strokeWidth="10" />
        <rect x="9" y="9" width={VIEW.width - 18} height={VIEW.height - 18} fill="none" style={{ stroke: "var(--floor-wall-line)" }} strokeWidth="1" opacity="0.5" />

        {/* reference grid letters — faint, for the location readout */}
        <g style={{ fill: "var(--floor-mark)" }} fontSize="9" opacity="0.42" className="machine">
          {Array.from({ length: 10 }, (_, i) => (
            <text key={`c${i}`} x={i * 100 + 50} y="22" textAnchor="middle">{i + 1}</text>
          ))}
          {["A", "B", "C", "D", "E", "F"].map((letter, i) => (
            <text key={letter} x="22" y={i * 103.3 + 58} textAnchor="middle">{letter}</text>
          ))}
        </g>

        <Fixtures />

        {mode !== "frame" && world.zones.map((zone) => (
          <Zone
            key={zone.id}
            zone={zone}
            finding={zoneFindings.find((finding) => finding.id === zone.id) ?? null}
            readable={readable}
            selected={zone.id === selectedId}
            onSelect={interactive ? () => onSelect?.(zone.id) : null}
            px={px}
            labelled={mode === "full"}
          />
        ))}

        {lens && (
          <g pointerEvents="none">
            <polygon
              points={`${lens[0]},${lens[1]} ${VIEW.width - 6},266 ${VIEW.width - 6},${VIEW.height - 6} 277,${VIEW.height - 6}`}
              fill="url(#cone)"
            />
            <line x1={lens[0]} y1={lens[1]} x2={VIEW.width - 6} y2="266" stroke="#BFDBFE" strokeWidth="1" opacity="0.45" />
            <line x1={lens[0]} y1={lens[1]} x2="277" y2={VIEW.height - 6} stroke="#BFDBFE" strokeWidth="1" opacity="0.45" />
          </g>
        )}

        {[...world.things]
          .sort((a, b) => a.y - b.y)
          .map((thing) => {
            const finding = findingFor(thing.id);
            const detection = detectionFor(thing.id);
            const label = labelFor({ thing, finding, zoneFindings, readable, bars });
            const dim = finding?.settled === "lost" ? 0.35 : 1;
            const box = DETECTION_BOX[thing.kind] ?? DEFAULT_DETECTION_BOX;
            const hit = HIT_AREA[thing.kind] ?? DEFAULT_HIT;
            const draggable = interactive && !STATIC_KINDS.has(thing.kind);
            return (
              <g
                key={thing.id}
                data-thing={thing.kind}
                transform={`translate(${px(thing.x, "x")},${px(thing.y, "y")})`}
                onPointerDown={(event) => startDrag(event, thing)}
                onPointerMove={duringDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className={draggable ? "cursor-grab active:cursor-grabbing" : interactive ? "cursor-pointer" : ""}
                style={{ pointerEvents: drawing || !interactive ? "none" : "auto" }}
              >
                <circle r={hit.r} cy={hit.cy} fill="transparent" />
                <ThingArt thing={thing} dim={dim} />
                {mode === "full" && readable && (
                  <Overlay
                    thing={thing}
                    box={box}
                    label={label}
                    selected={thing.id === selectedId}
                    pulse={thing.id === pulseId}
                    originX={px(thing.x, "x")}
                  />
                )}
                {mode === "detect" && detection && (
                  <DetectBox box={box} detection={detection} />
                )}
              </g>
            );
          })}
      </g>

      {/* ---- what the camera is handed: the picture's own conditions ---- */}
      {light < 1 && (
        <rect width={VIEW.width} height={VIEW.height} style={{ fill: "var(--floor-scrim)" }} opacity={(1 - light) * 0.78} pointerEvents="none" />
      )}
      {squeeze > 0 && (
        <rect width={VIEW.width} height={VIEW.height} fill="url(#blocks)" opacity={squeeze * 0.35} pointerEvents="none" />
      )}

      {drawing && (
        <g pointerEvents="none">
          {draftPath && (
            <polyline
              points={hoverPoint ? `${draftPath} ${px(hoverPoint.x, "x")},${px(hoverPoint.y, "y")}` : draftPath}
              fill="none"
              stroke={ZONE_LOOK[drawing]?.colour ?? "#FACC15"}
              strokeWidth="2"
              strokeDasharray="8 5"
            />
          )}
          {draftPoints.map(([x, y], index) => (
            <circle key={index} cx={px(x, "x")} cy={px(y, "y")} r="5" fill={ZONE_LOOK[drawing]?.colour ?? "#FACC15"} />
          ))}
        </g>
      )}

      {/* ---- the picture cannot be read ---- */}
      {!readable && mode === "full" && (
        <g pointerEvents="none">
          <rect width={VIEW.width} height={VIEW.height} style={{ fill: "var(--floor-scrim)" }} opacity="0.72" />
          <rect x="8" y="8" width={VIEW.width - 16} height={VIEW.height - 16} rx="6" fill="none" stroke="#F59E0B" strokeOpacity="0.7" strokeWidth="3" strokeDasharray="18 12" />
          <rect x="250" y="240" width="500" height="132" rx="10" style={{ fill: "var(--floor-card)" }} opacity="0.96" stroke="#F59E0B" strokeWidth="1" />
          <text x="500" y="285" textAnchor="middle" fontSize="24" fontWeight="700" letterSpacing="1.5" fill="#F59E0B">
            CAMERA FEED UNREADABLE
          </text>
          <text x="500" y="316" textAnchor="middle" fontSize="16" style={{ fill: "var(--floor-card-ink)" }}>
            {reading.reason ?? "The picture cannot be checked."}
          </text>
          <text x="500" y="346" textAnchor="middle" fontSize="13" style={{ fill: "var(--floor-card-dim)" }}>
            Nothing is being judged. This is not the same as all clear.
          </text>
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Fixed fixtures — racking, machines, markings. Never hit-tested.     */
/* ------------------------------------------------------------------ */

function Rack({ x, y, width, height, shelves, boxes }) {
  const pitch = height / shelves;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill: "var(--floor-fixture-dark)" }} stroke="#1B1F25" strokeWidth="1.5" />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <line key={i} x1={x} y1={y + i * pitch} x2={x + width} y2={y + i * pitch} stroke="#525965" strokeWidth="1.5" />
      ))}
      {boxes.map(([bx, by, bw, bh, colour], i) => (
        <rect key={i} x={x + bx} y={y + by} width={bw} height={bh} rx="1" fill={colour} stroke="#3F2A14" strokeWidth="0.8" />
      ))}
    </g>
  );
}

function Machine({ x, y, width, height }) {
  return (
    <g>
      <rect x={x + 4} y={y + 5} width={width} height={height} rx="3" fill="rgb(4 27 76 / 0.18)" />
      <rect x={x} y={y} width={width} height={height} rx="3" style={{ fill: "var(--floor-fixture)", stroke: "var(--floor-fixture-dark)" }} strokeWidth="1.5" />
      <rect x={x + 10} y={y + 10} width={width - 20} height={height * 0.45} rx="2" style={{ fill: "var(--floor-fixture)" }} style={{ stroke: "var(--floor-fixture-dark)" }} strokeWidth="1" />
      <rect x={x + 12} y={y + height * 0.62} width={width * 0.35} height={height * 0.25} rx="2" fill="#1F2937" />
      <rect x={x + 14} y={y + height * 0.66} width={width * 0.3} height={height * 0.1} fill="#1D4ED8" opacity="0.5" />
      <circle cx={x + width - 14} cy={y + height - 12} r="3" fill="#22C55E" />
      <line x1={x + width * 0.62} y1={y + height * 0.62} x2={x + width * 0.62} y2={y + height - 8} stroke="#374151" strokeWidth="3" />
    </g>
  );
}

function Fixtures() {
  const brown = "#8B5E34";
  const brown2 = "#A0703F";
  return (
    <g pointerEvents="none" aria-hidden="true">
      {/* racking down the left wall */}
      <Rack
        x={18} y={118} width={52} height={400} shelves={5}
        boxes={[[6, 8, 18, 22, brown], [28, 6, 18, 24, brown2], [6, 88, 40, 26, brown], [8, 168, 20, 26, brown2], [30, 172, 16, 22, brown], [6, 250, 40, 24, brown2], [10, 330, 18, 24, brown], [30, 328, 16, 26, brown2]]}
      />
      {/* racking along the top wall */}
      <Rack
        x={140} y={16} width={300} height={50} shelves={2}
        boxes={[[8, 4, 40, 18, brown], [56, 3, 34, 20, brown2], [120, 4, 44, 18, brown], [180, 3, 30, 20, brown2], [230, 5, 40, 17, brown], [10, 29, 30, 18, brown2], [70, 28, 44, 18, brown], [150, 29, 34, 17, brown2], [250, 28, 40, 18, brown]]}
      />
      {/* machines on the right */}
      <Machine x={856} y={110} width={126} height={92} />
      <Machine x={856} y={300} width={126} height={110} />
      {/* pipes above the right machines */}
      <g style={{ stroke: "var(--floor-fixture-light)" }} strokeWidth="4" fill="none" opacity="0.8">
        <path d="M860 100 h120" />
        <path d="M980 100 v-70" />
      </g>
      {/* bollards by the door */}
      <circle cx="690" cy="62" r="7" fill="#FACC15" stroke="#111827" strokeWidth="1.5" />
      <circle cx="810" cy="62" r="7" fill="#FACC15" stroke="#111827" strokeWidth="1.5" />
      {/* lane line down the middle of the top hall */}
      <line x1="110" y1="120" x2="660" y2="120" stroke="#FACC15" strokeWidth="2" strokeDasharray="22 14" opacity="0.7" />
      {/* hazard stripes at the walkway's start */}
      <rect x="62" y="492" width="56" height="102" fill="url(#hazard)" opacity="0.85" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Marked areas                                                        */
/* ------------------------------------------------------------------ */

function Zone({ zone, finding, readable, selected, onSelect, px, labelled }) {
  const base = ZONE_LOOK[zone.type] ?? ZONE_LOOK.restricted;
  const state = readable ? finding?.settled ?? "clear" : "unreadable";
  const colour = state === "violation" ? "#EF4444" : state === "watching" ? "#FACC15" : base.colour;
  const fill = state === "violation" ? 0.38 : state === "watching" ? 0.2 : base.fill;
  const path = zone.points.map(([x, y]) => `${px(x, "x")},${px(y, "y")}`).join(" ");
  const xs = zone.points.map(([x]) => px(x, "x"));
  const ys = zone.points.map(([, y]) => px(y, "y"));
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const left = Math.min(...xs);
  const walkway = zone.type === "walkway";

  /*
   * Where the card sits.
   *
   * Outside the area, resting on its top edge — because the card has
   * something to say precisely when somebody is standing inside, and a
   * card printed across the middle of a zone is a card printed across
   * whoever put it into that state. Their own label sits above their head
   * and the two used to land on the same pixels, so the breach obscured
   * the reason for it. Below the area instead when there is no room above,
   * and inside it only when the area reaches both ends of the floor.
   */
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const half = (finding?.settled || !readable ? 46 : 30) / 2;
  const GAP = 10;
  const cardY =
    top - GAP - half * 2 >= 4
      ? top - GAP - half
      : bottom + GAP + half * 2 <= VIEW.height - 4
        ? bottom + GAP + half
        : top + 34;

  const names = (finding?.inside ?? []).map((entry) => entry.name ?? entry.id);
  const stateLine =
    state === "violation"
      ? walkway ? `BLOCKED · ${names.join(", ")}` : `BREACH · ${names.join(", ")}`
      : state === "watching"
        ? `${checkingText(finding.votes)} · ${names.join(", ")}`
        : state === "unreadable"
          ? "not being checked"
          : null;

  const cardSub = stateLine ?? zone.subtitle ?? base.sub;
  const cardWidth = zoneCardWidth(zone.name, cardSub);
  // Centred on the area, but never hanging off the floor.
  const cardX = Math.max(cardWidth / 2 + 6, Math.min(cx, VIEW.width - cardWidth / 2 - 6));

  return (
    <g opacity={state === "unreadable" ? 0.5 : 1}>
      <polygon
        points={path}
        fill={colour}
        fillOpacity={fill}
        stroke={colour}
        strokeWidth={state === "violation" ? 3.5 : walkway ? 3 : 2.5}
        strokeDasharray={state === "watching" ? "6 4" : base.dash ?? undefined}
        strokeLinejoin="round"
        className={state === "violation" ? "zone-alarm" : ""}
      />
      {walkway && (
        <g pointerEvents="none">
          <g transform={`translate(${left + 96},${cy})`} style={{ fill: "var(--floor-mark)" }} opacity="0.85">
            <circle cx="0" cy="-14" r="5" />
            <path d="M-5 -6 L5 -6 L8 6 L4 6 L2 -1 L0 14 L-3 14 L-3 2 L-5 14 L-8 14 L-6 -1 L-8 6 L-11 6 Z" />
          </g>
          <text
            x={left + 130}
            y={cy + 10}
            fontSize="30"
            fontWeight="700"
            letterSpacing="5"
            style={{ fill: "var(--floor-mark)" }}
            opacity="0.8"
          >
            WALKWAY
          </text>
        </g>
      )}
      {labelled && (
        <g
          transform={`translate(${walkway ? Math.max(...xs) - 150 : cardX},${walkway ? cy : cardY})`}
          onClick={onSelect ? (event) => { event.stopPropagation(); onSelect(); } : undefined}
          style={{ pointerEvents: onSelect ? "auto" : "none", cursor: onSelect ? "pointer" : "default" }}
        >
          {(!walkway || stateLine) && (
            <ZoneCard
              title={zone.name}
              sub={cardSub}
              width={cardWidth}
              colour={colour}
              selected={selected}
              alarm={state === "violation"}
            />
          )}
        </g>
      )}
    </g>
  );
}

function zoneCardWidth(title, sub) {
  return Math.max(title.length, (sub ?? "").length * 0.85) * 8.6 + 28;
}

function ZoneCard({ title, sub, width, colour, selected, alarm }) {
  const height = sub ? 46 : 30;
  return (
    <g transform={`translate(${-width / 2},${-height / 2})`}>
      <rect
        width={width}
        height={height}
        rx="5"
        style={{ fill: "var(--floor-card)" }}
        fillOpacity="0.92"
        stroke={selected ? "#60A5FA" : alarm ? colour : "#1F2937"}
        strokeWidth={selected || alarm ? 1.5 : 1}
      />
      <text x="14" y={sub ? 19 : 20} fontSize="14" fontWeight="700" fill={colour}>
        {title}
      </text>
      {sub && (
        <text x="14" y="37" fontSize="12" style={{ fill: alarm ? colour : "var(--floor-card-dim)" }}>
          {sub}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The operator overlay on a thing: detection box, label, selection.   */
/* ------------------------------------------------------------------ */

function Overlay({ thing, box, label, selected, pulse, originX = 500 }) {
  const tone = label.tone ? TONES[label.tone] : null;
  const { w, h, cy } = box;
  const top = cy - h / 2;
  const text = label.status ? `${label.label} · ${label.status}` : label.label;
  const chipWidth = text.length * 6.9 + 16;
  // The chip starts at the box's left edge, but never runs off the floor.
  const chipX = Math.max(10 - originX, Math.min(-w / 2, VIEW.width - 10 - originX - chipWidth));
  // A workstation's chip hangs below its box: the box is a presence area
  // somebody stands inside, and their own label sits above them.
  const chipY = thing.kind === KINDS.WORKSTATION ? cy + h / 2 + 4 : top - 22;

  // The box and the label are part of the thing for the pointer — clicking
  // a name selects what it names — but the pulse ring and the halo are not.
  return (
    <g>
      {pulse && (
        <circle r={Math.max(w, h) / 2 + 6} cy={cy} fill="none" stroke="#60A5FA" strokeWidth="3" className="pulse-ring" pointerEvents="none" />
      )}
      {selected && (
        <rect x={-w / 2 - 6} y={top - 6} width={w + 12} height={h + 12} rx="5" fill="none" stroke="#60A5FA" strokeWidth="2" strokeDasharray="5 4" pointerEvents="none" />
      )}
      {tone && (
        <>
          <rect
            x={-w / 2}
            y={top}
            width={w}
            height={h}
            rx="2"
            fill={tone.colour}
            fillOpacity={label.tone === "violation" ? 0.16 : label.tone === "station" ? 0.06 : 0.05}
            stroke={tone.colour}
            strokeWidth={label.tone === "violation" ? 2.5 : 2}
            strokeDasharray={tone.dash ?? undefined}
            className={label.tone === "violation" ? "zone-alarm" : ""}
          />
          {label.tone !== "station" && (
            <path
              d={corners(w, h, cy, 9)}
              fill="none"
              stroke={tone.colour}
              strokeWidth="3.5"
              strokeLinecap="square"
            />
          )}
          <rect x={chipX} y={chipY} width={chipWidth} height="18" rx="3" fill={tone.colour} />
          {thing.kind === KINDS.WORKER && (
            <path
              transform={`translate(${chipX + 6},${chipY + 4})`}
              d="M1 8 h9 v-1.5 a4.5 4.5 0 0 0 -9 0 z M4 3.2 h3 v-2 h-3 z"
              fill={tone.text}
            />
          )}
          <text
            x={chipX + (thing.kind === KINDS.WORKER ? 20 : 8)}
            y={chipY + 13}
            fontSize="12"
            fontWeight="700"
            fill={tone.text}
          >
            {text}
          </text>
        </>
      )}
      {!tone && (
        <text x="0" y={cy + h / 2 + 14} textAnchor="middle" fontSize="11" style={{ fill: "var(--floor-mark)" }} opacity="0.8" pointerEvents="none">
          {label.label}
        </text>
      )}
    </g>
  );
}

const CLASS_TONE = { person: "#22C55E", forklift: "#F97316", object: "#94A3B8", door: "#22D3EE" };

function DetectBox({ box, detection }) {
  const { w, h, cy } = box;
  const colour = CLASS_TONE[detection.label] ?? "#94A3B8";
  return (
    <g pointerEvents="none">
      <rect x={-w / 2} y={cy - h / 2} width={w} height={h} fill="none" stroke={colour} strokeWidth="3" />
      <rect x={-w / 2} y={cy - h / 2 - 20} width={detection.label.length * 8 + 44} height="20" fill={colour} />
      <text x={-w / 2 + 4} y={cy - h / 2 - 5} fontSize="14" fontWeight="700" fill="#0B1220">
        {detection.label} {detection.score.toFixed(2)}
      </text>
    </g>
  );
}

function corners(w, h, cy, length) {
  const hw = w / 2;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  return [
    `M${-hw} ${top + length} L${-hw} ${top} L${-hw + length} ${top}`,
    `M${hw - length} ${top} L${hw} ${top} L${hw} ${top + length}`,
    `M${-hw} ${bottom - length} L${-hw} ${bottom} L${-hw + length} ${bottom}`,
    `M${hw - length} ${bottom} L${hw} ${bottom} L${hw} ${bottom - length}`,
  ].join(" ");
}
