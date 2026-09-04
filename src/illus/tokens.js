/*
 * Smart Factory — Illustration numeric law (Illustration Rulebook §6, §7, §8).
 * ONE source of truth for the geometry system. Colors are CSS-variable strings
 * (see tokens.css) so the dark/light theme swaps by token, not by editing figures.
 */

// §7 — color tokens as CSS-variable references. Never inline hex in a figure.
export const C = {
  canvas: 'var(--ill-canvas)',
  surface: 'var(--ill-surface)',
  surface2: 'var(--ill-surface-2)',
  structure: 'var(--ill-structure)',
  primary: 'var(--ill-primary)',
  secondary: 'var(--ill-secondary)',
  inactive: 'var(--ill-inactive)',
  hairline: 'var(--ill-hairline)',
  disabled: 'var(--ill-disabled)',
  select: 'var(--ill-select)',
  success: 'var(--ill-success)',
  warn: 'var(--ill-warn)',
  fault: 'var(--ill-fault)',
  copper: 'var(--ill-copper)',
};

// §6.3 — the six-step stroke ladder (drawing units). No other weights allowed.
export const W = { W0: 0.5, W1: 0.75, W2: 1.25, W3: 1.75, W4: 2.0, W5: 2.5 };

// §6.2 — the grid. Everything snaps to 4 du; ports on a 16 du pitch.
export const GRID = { base: 8, half: 4, portPitch: 16, safe: 32, gutter: 160 };

// §6.1 — canonical canvases [w, h]. Pick the smallest that fits.
export const CANVAS = {
  inline: [480, 288],
  figure: [960, 600], // the default
  stage: [1440, 896],
  detail: [640, 480],
};

// §6.3 — dash patterns carry fixed meanings. Do not reuse decoratively.
export const DASH = {
  solid: undefined,
  deenergized: '6 4', // isolated / out of service
  signal: '2 3', // control / information (non-power)
  boundary: '10 4 2 4', // skid / scope / system envelope
  fault: '8 4', // fault path (+ badge)
  hidden: '1 3', // geometry behind a cut plane
  flow: '6 6', // animated flow dashes (§11)
};

// §7.2 — medium → line style. Fixed mapping; do not improvise per figure.
export const MEDIUM = {
  electrical: { stroke: C.structure, width: W.W3, dash: DASH.solid },
  signal: { stroke: C.primary, width: W.W2, dash: DASH.signal },
  data: { stroke: C.primary, width: W.W2, dash: DASH.signal },
  liquid: { stroke: C.primary, width: W.W3, dash: DASH.solid },
  gas: { stroke: C.inactive, width: W.W3, dash: DASH.solid },
  steam: { stroke: C.secondary, width: W.W3, dash: DASH.solid },
  hydraulic: { stroke: C.structure, width: W.W3, dash: DASH.solid },
  pneumatic: { stroke: C.primary, width: W.W3, dash: DASH.deenergized },
  mechanical: { stroke: C.structure, width: W.W4, dash: DASH.solid },
  thermal: { stroke: C.secondary, width: W.W2, dash: DASH.signal },
  optical: { stroke: C.primary, width: W.W2, dash: DASH.hidden },
};

// §7.5 — state encoding. NEVER color alone: every state carries a 2nd cue.
export const STATE = {
  normal: { color: C.success, dash: DASH.solid, glyph: null },
  energized: { color: C.select, dash: DASH.solid, glyph: null, weight: W.W5 },
  standby: { color: C.inactive, dash: DASH.deenergized, glyph: null },
  warning: { color: C.warn, dash: DASH.solid, glyph: '\u25B3' }, // △
  fault: { color: C.fault, dash: DASH.fault, glyph: '\u26A0' }, // ⚠
  disabled: { color: C.disabled, dash: DASH.solid, glyph: null, opacity: 0.4 },
};

// §8 — typography. Numbers/tags/units are ALWAYS mono + tabular-nums.
export const FONT = {
  sans: "Inter, 'SF Pro Display', 'Segoe UI', sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
};
export const TYPE = {
  title: { size: 16, weight: 600, font: FONT.sans },
  group: { size: 13, weight: 600, font: FONT.sans, spacing: '0.06em', upper: true },
  label: { size: 12, weight: 500, font: FONT.sans },
  tag: { size: 11, weight: 500, font: FONT.mono, spacing: '0.06em', upper: true },
  value: { size: 13, weight: 500, font: FONT.mono },
  unit: { size: 10, weight: 400, font: FONT.mono },
  dim: { size: 10, weight: 400, font: FONT.mono },
  legend: { size: 11, weight: 400, font: FONT.sans },
  badge: { size: 10, weight: 400, font: FONT.mono },
};

// §7.4 — material fills for section/physical views (slot → hex + hatch id).
// Hex here is intentional: these are physical-material legend swatches, not theme chrome.
export const MATERIAL = {
  M1: { fill: '#eae4e0', hatch: 'none' },
  M2: { fill: '#d8d2ce', hatch: 'dot' },
  M3: { fill: '#e7c7ad', hatch: 'h45' },
  M4: { fill: '#d0a488', hatch: 'h135' },
  M5: { fill: '#b78369', hatch: 'cross' },
  M6: { fill: '#c7cddc', hatch: 'none' },
  M7: { fill: '#97a3c0', hatch: 'h45' },
  M8: { fill: '#465889', hatch: 'cross' },
};

// Snap a coordinate to the 4 du half-grid (§5.12 / §6.2). Use in layout.
export const snap = (n) => Math.round(n / GRID.half) * GRID.half;
