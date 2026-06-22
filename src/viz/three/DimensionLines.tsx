'use client';
import { Line, Html } from '@react-three/drei';

/**
 * Engineering-style dimension annotations for the device geometry: the gate
 * LENGTH (L, along x) and channel WIDTH (W, along the depth axis z), each drawn
 * as a dimension line with extension lines + end ticks and the measured value —
 * the way a layout/textbook figure calls out a feature size. Values are read
 * straight from the parameters, so they track L / W live.
 */
const COL = '#8793a3'; // neutral slate — legible on both light & dark stages

function Tick({ a, b }: { a: [number, number, number]; b: [number, number, number] }) {
  return <Line points={[a, b]} color={COL} lineWidth={1} transparent opacity={0.85} />;
}

export function DimensionLines({
  gateLength,
  width,
  lLabel,
  wLabel,
  position = [0, 0, 0],
}: {
  gateLength: number;
  width: number;
  lLabel: string;
  wLabel: string;
  position?: [number, number, number];
}) {
  const gl = gateLength;
  const w = width;
  const y = -0.16; // just below the silicon surface
  const zf = w / 2 + 0.45; // L dimension sits in front of the device
  const xr = gl / 2 + 0.55; // W dimension sits to the right
  const t = 0.08; // tick half-length

  return (
    <group position={position}>
      {/* ---- L (gate length), along x, in front ---- */}
      <Tick a={[-gl / 2, 0.0, w / 2]} b={[-gl / 2, y, zf]} />
      <Tick a={[gl / 2, 0.0, w / 2]} b={[gl / 2, y, zf]} />
      <Line points={[[-gl / 2, y, zf], [gl / 2, y, zf]]} color={COL} lineWidth={1.4} />
      <Tick a={[-gl / 2, y - t, zf]} b={[-gl / 2, y + t, zf]} />
      <Tick a={[gl / 2, y - t, zf]} b={[gl / 2, y + t, zf]} />
      <Html center distanceFactor={9} position={[0, y - 0.12, zf]} zIndexRange={[20, 0]}>
        <span className="select-none whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm">
          L = <span style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{lLabel}</span>
        </span>
      </Html>

      {/* ---- W (channel width), along z, to the right ---- */}
      <Tick a={[gl / 2, 0.0, -w / 2]} b={[xr, y, -w / 2]} />
      <Tick a={[gl / 2, 0.0, w / 2]} b={[xr, y, w / 2]} />
      <Line points={[[xr, y, -w / 2], [xr, y, w / 2]]} color={COL} lineWidth={1.4} />
      <Tick a={[xr, y - t, -w / 2]} b={[xr, y + t, -w / 2]} />
      <Tick a={[xr, y - t, w / 2]} b={[xr, y + t, w / 2]} />
      <Html center distanceFactor={9} position={[xr + 0.15, y - 0.1, 0]} zIndexRange={[20, 0]}>
        <span className="select-none whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 font-mono text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm">
          W = <span style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{wLabel}</span>
        </span>
      </Html>
    </group>
  );
}

/** Format a length in metres as nm / µm for a dimension label. */
export function formatLength(meters: number): string {
  if (meters >= 1e-6) return `${Number((meters / 1e-6).toPrecision(3))} µm`;
  return `${Number((meters / 1e-9).toPrecision(3))} nm`;
}
