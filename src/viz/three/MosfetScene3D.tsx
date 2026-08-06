'use client';
import { useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges, Line } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { CalloutLabel } from './CalloutLabel';
import { useThemeStore } from '@/ui/theme';
import { useDevice } from '@/ui/hooks/useDevice';
import { useVizStore } from '@/state/viz.store';
import { useLabModes, crossSectionActive } from './lab-modes';
import { damp } from './anim';

/**
 * MOSFET 3D illustration — the reference cross-section (page 4), now driven by
 * the parameter sliders: Gate Length (L) sets the gate/channel span, Gate
 * Width (W) the depth, and Oxide Thickness (Tox) the oxide layer. The
 * "Cross-section" toggle swings the camera to a flat head-on view.
 */

const C = {
  substrate: '#f2d79a',
  n: '#a9c7e0',
  channel: '#7fd8ff',
  oxide: '#dcecf5',
  metal: '#565f6b',
  depletion: '#c9822f',
  edge: '#1f2937',
};

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// Live geometry from the device parameters (three.js: X = width, Y = up, Z = depth).
function geom(L: number, W: number, Tox: number) {
  const GH = clamp(0.4, 1.4, (L / 180e-9) * 1.0); // half gate/channel length ← L
  const ZH = clamp(0.55, 2.0, (W / 1e-6) * 1.15); // half depth ← W
  const OX_H = clamp(0.06, 0.45, (Tox / 4e-9) * 0.16); // oxide thickness ← Tox
  const GATE_H = 0.36;
  const OX_HALF = GH + 0.4;
  const NP_IN = OX_HALF - 0.12;
  const NP_OUT = NP_IN + 1.4;
  const N_DEPTH = -0.62;
  const SUB_BOT = -1.6;
  const SUB_X = NP_OUT + 0.55;
  const DRAIN_CX = (NP_IN + NP_OUT) / 2;
  const PAD_W = 0.55;
  const PAD_H = 0.3;
  return { GH, ZH, OX_H, GATE_H, OX_HALF, NP_IN, NP_OUT, N_DEPTH, SUB_BOT, SUB_X, DRAIN_CX, PAD_W, PAD_H };
}
type Geom = ReturnType<typeof geom>;

// swings the camera to a flat head-on cross-section when the toggle is on
function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    if (!cross) return;
    const k = reducedMotion ? 1e3 : 4;
    cam.position.x = damp(cam.position.x, 0, k, dt);
    cam.position.y = damp(cam.position.y, 0.1, k, dt);
    cam.position.z = damp(cam.position.z, 9.4, k, dt);
    cam.lookAt(0, -0.2, 0);
  });
  return null;
}

function Box({
  x0, x1, y0, y1, z0, z1, color, opacity = 1, emissive, emissiveIntensity = 0, edge = true, roughness = 0.6, metalness = 0.05, pushBack = false,
}: {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  color: string; opacity?: number; emissive?: string; emissiveIntensity?: number; edge?: boolean; roughness?: number; metalness?: number; pushBack?: boolean;
}) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissiveIntensity}
        roughness={roughness}
        metalness={metalness}
        depthWrite={opacity >= 1}
        polygonOffset={pushBack}
        polygonOffsetFactor={pushBack ? 1 : 0}
        polygonOffsetUnits={pushBack ? 1 : 0}
      />
      {edge && <Edges threshold={15} color={C.edge} />}
    </mesh>
  );
}

const chip = (text: string, bold = false) => (
  <span
    className={`select-none whitespace-nowrap rounded-md bg-black/70 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm ${
      bold ? 'font-bold' : ''
    }`}
  >
    {text}
  </span>
);

function Stage({ g, cross, reducedMotion }: { g: Geom; cross: boolean; reducedMotion: boolean }) {
  const zf = g.ZH + 0.001; // front face (toward viewer)
  return (
    <>
      <CameraRig cross={cross} reducedMotion={reducedMotion} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 9, 8]} intensity={2.6} />
      <pointLight position={[-6, 3, 5]} intensity={14} color="#dfe8ff" />

      {/* p-type substrate (body) */}
      <Box x0={-g.SUB_X} x1={g.SUB_X} y0={g.SUB_BOT} y1={0} z0={-g.ZH} z1={g.ZH} color={C.substrate} roughness={0.8} pushBack />

      {/* depletion region — translucent shell under the junctions/channel;
         pulled slightly proud of the front face so it never z-fights the n+ */}
      <Box x0={-g.NP_OUT + 0.15} x1={g.NP_OUT - 0.15} y0={-0.95} y1={-0.04} z0={-g.ZH - 0.012} z1={g.ZH + 0.012} color={C.depletion} opacity={0.16} edge={false} />

      {/* n+ source / drain diffusions */}
      <Box x0={-g.NP_OUT} x1={-g.NP_IN} y0={g.N_DEPTH} y1={0} z0={-g.ZH} z1={g.ZH} color={C.n} />
      <Box x0={g.NP_IN} x1={g.NP_OUT} y0={g.N_DEPTH} y1={0} z0={-g.ZH} z1={g.ZH} color={C.n} />

      {/* channel region */}
      <Box x0={-g.GH} x1={g.GH} y0={-0.06} y1={0} z0={-g.ZH} z1={g.ZH} color={C.channel} emissive={C.channel} emissiveIntensity={0.5} edge={false} />

      {/* gate oxide (overhangs the channel) */}
      <Box x0={-g.OX_HALF} x1={g.OX_HALF} y0={0} y1={g.OX_H} z0={-g.ZH} z1={g.ZH} color={C.oxide} opacity={0.85} roughness={0.3} />

      {/* metal gate */}
      <Box x0={-g.GH} x1={g.GH} y0={g.OX_H} y1={g.OX_H + g.GATE_H} z0={-g.ZH} z1={g.ZH} color={C.metal} roughness={0.35} metalness={0.5} />

      {/* source / drain contact pads */}
      <Box x0={-g.DRAIN_CX - g.PAD_W / 2} x1={-g.DRAIN_CX + g.PAD_W / 2} y0={0} y1={g.PAD_H} z0={-g.ZH * 0.6} z1={g.ZH * 0.6} color={C.metal} roughness={0.35} metalness={0.5} />
      <Box x0={g.DRAIN_CX - g.PAD_W / 2} x1={g.DRAIN_CX + g.PAD_W / 2} y0={0} y1={g.PAD_H} z0={-g.ZH * 0.6} z1={g.ZH * 0.6} color={C.metal} roughness={0.35} metalness={0.5} />

      {/* L (channel length) dimension bracket above the gate */}
      <Line points={[[-g.GH, g.OX_H + g.GATE_H + 0.35, zf], [g.GH, g.OX_H + g.GATE_H + 0.35, zf]]} color={C.edge} lineWidth={1.4} />
      <Line points={[[-g.GH, g.OX_H + g.GATE_H, zf], [-g.GH, g.OX_H + g.GATE_H + 0.35, zf]]} color={C.edge} lineWidth={1.4} />
      <Line points={[[g.GH, g.OX_H + g.GATE_H, zf], [g.GH, g.OX_H + g.GATE_H + 0.35, zf]]} color={C.edge} lineWidth={1.4} />

      {/* labels */}
      <CalloutLabel anchor={[-g.DRAIN_CX, g.PAD_H, zf]} position={[-g.DRAIN_CX - 0.4, 1.5, g.ZH + 0.6]}>{chip('Source (S)', true)}</CalloutLabel>
      <CalloutLabel anchor={[0, g.OX_H + g.GATE_H, zf]} position={[0, 2.0, g.ZH + 0.6]}>{chip('Gate (G)', true)}</CalloutLabel>
      <CalloutLabel anchor={[g.DRAIN_CX, g.PAD_H, zf]} position={[g.DRAIN_CX + 0.4, 1.5, g.ZH + 0.6]}>{chip('Drain (D)', true)}</CalloutLabel>
      <CalloutLabel anchor={[0, g.OX_H + g.GATE_H + 0.35, zf]} position={[0, g.OX_H + g.GATE_H + 1.0, g.ZH + 0.3]} leader={false}>{chip('L', true)}</CalloutLabel>
      <CalloutLabel anchor={[g.GH * 0.6, g.OX_H + g.GATE_H / 2, g.ZH]} position={[g.SUB_X + 0.7, g.OX_H + g.GATE_H + 0.2, g.ZH]}>{chip('Metal')}</CalloutLabel>
      <CalloutLabel anchor={[g.OX_HALF - 0.05, g.OX_H / 2, g.ZH]} position={[g.SUB_X + 0.9, g.OX_H, g.ZH]}>{chip('Oxide (SiO₂)')}</CalloutLabel>
      <CalloutLabel anchor={[-g.DRAIN_CX, g.N_DEPTH / 2, zf]} position={[-g.DRAIN_CX, g.N_DEPTH / 2, zf]} leader={false}>{chip('n+')}</CalloutLabel>
      <CalloutLabel anchor={[g.DRAIN_CX, g.N_DEPTH / 2, zf]} position={[g.DRAIN_CX, g.N_DEPTH / 2, zf]} leader={false}>{chip('n+')}</CalloutLabel>
      <CalloutLabel anchor={[0, -0.03, zf]} position={[-g.GH - 1.1, -0.6, g.ZH + 0.5]}>{chip('Channel region')}</CalloutLabel>
      <CalloutLabel anchor={[g.NP_OUT - 0.4, -0.55, zf]} position={[g.SUB_X + 0.8, -0.7, g.ZH + 0.3]}>{chip('Depletion region')}</CalloutLabel>
      <CalloutLabel anchor={[0, g.SUB_BOT * 0.45, zf]} position={[0, g.SUB_BOT * 0.45, zf]} leader={false}>{chip('p-type substrate (Body)', true)}</CalloutLabel>

      {/* no damping → no idle jitter; rotate/zoom lock while in cross-section */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        minDistance={5}
        maxDistance={16}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2 + 0.1}
        target={[0, -0.2, 0]}
      />
    </>
  );
}

export function MosfetScene3D() {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  const { values } = useDevice();
  const cross = useLabModes(crossSectionActive);
  const reducedMotion = useVizStore((s) => s.reducedMotion);
  const g = useMemo(
    () => geom(Number(values.L) || 180e-9, Number(values.W) || 1e-6, Number(values.Tox) || 4e-9),
    [values.L, values.W, values.Tox],
  );
  return (
    <Canvas frameloop="always" camera={{ position: [5.2, 3.6, 8.4], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      <Stage g={g} cross={cross} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
