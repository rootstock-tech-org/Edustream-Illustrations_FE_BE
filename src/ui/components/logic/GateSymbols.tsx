'use client';
import type { CSSProperties } from 'react';

/**
 * ANSI/IEEE distinctive-shape logic-gate symbols, drawn to match the
 * Digital Electronics reference sheet exactly (buffer triangle, AND D-shape,
 * OR shield, XOR double-back, plus inversion bubbles for NOT/NAND/NOR/XNOR).
 *
 * Every gate is authored inside a fixed 60×40 unit box (output nose at the
 * right-middle, inputs on the left) and then translated/scaled via a single
 * <g transform>. This keeps the geometry identical everywhere the symbols are
 * reused: the page-1 gate gallery, the MUX/DEMUX gate-level diagrams and the
 * flip-flop schematics. Colour is theme-aware and can be driven live by a
 * signal value (`high`) with an optional clock-pulse flash (`pulseKey`).
 */

export type GateKind = 'buffer' | 'not' | 'and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor';

const UNIT_W = 60;
const UNIT_H = 40;
const BUBBLE_R = 4;

/** True for the inverting gates that carry an output bubble. */
const INVERTING: Record<GateKind, boolean> = {
  buffer: false, not: true, and: false, nand: true, or: false, nor: true, xor: false, xnor: true,
};

/** Base family shape (before the bubble) for each gate. */
function bodyPath(kind: GateKind): string {
  switch (kind) {
    case 'buffer':
    case 'not':
      // Triangle: flat back, nose at right-middle.
      return `M 4 2 L 4 38 L 48 20 Z`;
    case 'and':
    case 'nand':
      // Flat back + semicircular front (D-shape).
      return `M 4 2 L 30 2 A 18 18 0 0 1 30 38 L 4 38 Z`;
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor':
      // OR shield: concave back, two convex edges meeting at a nose.
      return `M 4 2 Q 30 4 54 20 Q 30 36 4 38 Q 20 20 4 2 Z`;
  }
}

/** The extra concave arc drawn just behind XOR/XNOR. */
function xorBackArc(): string {
  return `M -3 2 Q 13 20 -3 38`;
}

export interface GateSymbolProps {
  kind: GateKind;
  /** Top-left of the gate's bounding box in the parent SVG coordinate space. */
  x: number;
  y: number;
  /** Uniform scale applied to the 60×40 unit box. */
  scale?: number;
  /** Optional live-signal colouring: green when high, muted when low. */
  high?: boolean;
  /** Base stroke when `high` is undefined (static reference drawings). */
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  /** Bump on each clock pulse to trigger a staggered flash animation. */
  pulseKey?: number;
  pulseDelayMs?: number;
  /** Centred label drawn inside the body (e.g. gate id in a schematic). */
  label?: string;
}

export function GateSymbol({
  kind,
  x,
  y,
  scale = 1,
  high,
  stroke = 'rgb(var(--ink))',
  strokeWidth = 1.8,
  fill = 'none',
  pulseKey,
  pulseDelayMs = 0,
  label,
}: GateSymbolProps) {
  const color = high === undefined ? stroke : high ? '#22c55e' : 'rgb(var(--ink-muted))';
  const transition: CSSProperties = { transition: 'stroke 350ms ease, fill 350ms ease' };
  const bubble = INVERTING[kind];
  const noseX = kind === 'buffer' || kind === 'not' ? 48 : kind === 'and' || kind === 'nand' ? 48 : 54;

  return (
    <g
      key={pulseKey}
      transform={`translate(${x} ${y}) scale(${scale})`}
      className={pulseKey ? 'gate-flash' : undefined}
      style={pulseKey ? { animationDelay: `${pulseDelayMs}ms` } : undefined}
    >
      {(kind === 'xor' || kind === 'xnor') && (
        <path d={xorBackArc()} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" style={transition} />
      )}
      <path d={bodyPath(kind)} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" style={transition} />
      {bubble && (
        <circle cx={noseX + BUBBLE_R} cy={20} r={BUBBLE_R} fill="rgb(var(--surface))" stroke={color} strokeWidth={strokeWidth} style={transition} />
      )}
      {label && (
        <text x={26} y={23} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fontWeight={700} fill={color} style={transition}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Geometry helpers so callers can wire pins without re-deriving the unit box.
 * All values are in the gate's own unit space; multiply by `scale` and add the
 * gate origin to get parent-space coordinates.
 */
export const GATE_GEOMETRY = {
  width: UNIT_W,
  height: UNIT_H,
  bubbleR: BUBBLE_R,
  /** Input Y positions (two-input gates) in unit space. */
  inputYs: [12, 28] as const,
  /** Single-input Y (buffer/not). */
  singleInputY: 20,
  /** Left edge X where input wires connect. */
  inputX: 4,
  /** Output nose X per family (before the bubble). */
  outputX(kind: GateKind): number {
    if (kind === 'buffer' || kind === 'not') return 48;
    if (kind === 'and' || kind === 'nand') return 48;
    return 54;
  },
  /** Output X including the inversion bubble, in unit space. */
  outputXWithBubble(kind: GateKind): number {
    const base = this.outputX(kind);
    return INVERTING[kind] ? base + BUBBLE_R * 2 : base;
  },
} as const;
