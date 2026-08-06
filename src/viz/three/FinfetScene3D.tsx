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
 * FinFET 3D illustration — the reference structure (page 5), driven by the
 * parameter sliders: Gate Length (L) sets the gate span along the fin, Gate
 * Width (W) the fin height, and Oxide Thickness (Tox) the oxide layer. The
 * "Cross-section" toggle swings the camera to look down the fin axis.
 */

const C = {
  substrate: '#9aa3ad',
  fin: '#c2cad2',
  oxide: '#f0a53a',
  gate: '#3b7fd4',
  edge: '#1f2937',
};

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// three.js: X = fin width, Y = up, Z = source→drain length
function geom(L: number, W: number, Tox: number) {
  const GATE_HL = clamp(0.35, 1.3, (L / 180e-9) * 0.72); // half gate length along fin ← L
  const FIN_TOP = clamp(0.85, 2.1, (W / 1e-6) * 1.3); // fin height ← W
  const OX_TOP = clamp(0.06, 0.4, (Tox / 4e-9) * 0.14); // oxide thickness ← Tox
  const SUB_HALF = 2.7;
  const SUB_BOT = -1.1;
  const FIN_HW = 0.3;
  const FIN_LEN = 2.35; // half length
  const GATE_HW = 0.98;
  const GATE_TOP = FIN_TOP + 0.48;
  return { SUB_HALF, SUB_BOT, OX_TOP, FIN_HW, FIN_LEN, FIN_TOP, GATE_HW, GATE_HL, GATE_TOP };
}
type Geom = ReturnType<typeof geom>;

// swings the camera down the fin axis for a cross-section view when toggled on
function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    if (!cross) return;
    const k = reducedMotion ? 1e3 : 4;
    cam.position.x = damp(cam.position.x, 0, k, dt);
    cam.position.y = damp(cam.position.y, 0.8, k, dt);
    cam.position.z = damp(cam.position.z, 8.4, k, dt);
    cam.lookAt(0, 0.5, 0);
  });
  return null;
}

function Box({
  x0, x1, y0, y1, z0, z1, color, opacity = 1, roughness = 0.6, metalness = 0.08, pushBack = false,
}: {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  color: string; opacity?: number; roughness?: number; metalness?: number; pushBack?: boolean;
}) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={roughness}
        metalness={metalness}
        depthWrite={opacity >= 1}
        polygonOffset={pushBack}
        polygonOffsetFactor={pushBack ? 1 : 0}
        polygonOffsetUnits={pushBack ? 1 : 0}
      />
      <Edges threshold={15} color={C.edge} />
    </mesh>
  );
}

const chip = (text: string, bold = true) => (
  <span
    className={`select-none whitespace-nowrap rounded-md bg-black/70 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm ${
      bold ? 'font-bold' : ''
    }`}
  >
    {text}
  </span>
);

function Stage({ g, cross, reducedMotion }: { g: Geom; cross: boolean; reducedMotion: boolean }) {
  return (
    <>
      <CameraRig cross={cross} reducedMotion={reducedMotion} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 9, 6]} intensity={2.6} />
      <pointLight position={[-6, 3, 5]} intensity={14} color="#dfe8ff" />

      {/* silicon substrate */}
      <Box x0={-g.SUB_HALF} x1={g.SUB_HALF} y0={g.SUB_BOT} y1={0} z0={-g.SUB_HALF} z1={g.SUB_HALF} color={C.substrate} roughness={0.85} pushBack />
      {/* orange gate-oxide layer */}
      <Box x0={-g.SUB_HALF} x1={g.SUB_HALF} y0={0} y1={g.OX_TOP} z0={-g.SUB_HALF} z1={g.SUB_HALF} color={C.oxide} roughness={0.5} pushBack />
      {/* silicon fin */}
      <Box x0={-g.FIN_HW} x1={g.FIN_HW} y0={g.OX_TOP} y1={g.FIN_TOP} z0={-g.FIN_LEN} z1={g.FIN_LEN} color={C.fin} roughness={0.6} />
      {/* blue gate wrapping the fin */}
      <Box x0={-g.GATE_HW} x1={g.GATE_HW} y0={g.OX_TOP} y1={g.GATE_TOP} z0={-g.GATE_HL} z1={g.GATE_HL} color={C.gate} roughness={0.35} metalness={0.25} />

      {/* dimension brackets */}
      {/* Fin Width — across the fin top at the +Z end */}
      <Line points={[[-g.FIN_HW, g.FIN_TOP + 0.3, g.FIN_LEN], [g.FIN_HW, g.FIN_TOP + 0.3, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[-g.FIN_HW, g.FIN_TOP, g.FIN_LEN], [-g.FIN_HW, g.FIN_TOP + 0.3, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[g.FIN_HW, g.FIN_TOP, g.FIN_LEN], [g.FIN_HW, g.FIN_TOP + 0.3, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      {/* Fin Height — up the fin +X/+Z corner */}
      <Line points={[[g.FIN_HW + 0.35, g.OX_TOP, g.FIN_LEN], [g.FIN_HW + 0.35, g.FIN_TOP, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[g.FIN_HW, g.OX_TOP, g.FIN_LEN], [g.FIN_HW + 0.35, g.OX_TOP, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[g.FIN_HW, g.FIN_TOP, g.FIN_LEN], [g.FIN_HW + 0.35, g.FIN_TOP, g.FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      {/* Gate Length — along the fin under the gate */}
      <Line points={[[g.GATE_HW, g.GATE_TOP + 0.3, g.GATE_HL], [g.GATE_HW, g.GATE_TOP + 0.3, -g.GATE_HL]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[g.GATE_HW, g.GATE_TOP, g.GATE_HL], [g.GATE_HW, g.GATE_TOP + 0.3, g.GATE_HL]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[g.GATE_HW, g.GATE_TOP, -g.GATE_HL], [g.GATE_HW, g.GATE_TOP + 0.3, -g.GATE_HL]]} color={C.edge} lineWidth={1.3} />

      {/* labels */}
      <CalloutLabel anchor={[-g.GATE_HW, g.GATE_TOP * 0.7, 0]} position={[-g.GATE_HW - 1.2, g.GATE_TOP + 0.4, 0]}>{chip('Gate')}</CalloutLabel>
      <CalloutLabel anchor={[0, g.FIN_TOP * 0.6, g.FIN_LEN]} position={[0, g.FIN_TOP * 0.6 + 0.3, g.FIN_LEN + 1.1]}>{chip('Source')}</CalloutLabel>
      <CalloutLabel anchor={[0, g.FIN_TOP * 0.6, -g.FIN_LEN]} position={[0, g.FIN_TOP * 0.6 + 0.3, -g.FIN_LEN - 1.1]}>{chip('Drain')}</CalloutLabel>
      <CalloutLabel anchor={[g.SUB_HALF, g.OX_TOP / 2, -g.SUB_HALF + 0.6]} position={[g.SUB_HALF + 1.0, g.OX_TOP + 0.3, -g.SUB_HALF + 0.6]}>{chip('Oxide')}</CalloutLabel>
      <CalloutLabel anchor={[g.SUB_HALF, g.SUB_BOT / 2, g.SUB_HALF - 0.6]} position={[g.SUB_HALF + 1.2, g.SUB_BOT / 2, g.SUB_HALF - 0.6]}>{chip('Silicon Substrate')}</CalloutLabel>
      <CalloutLabel anchor={[0, g.FIN_TOP + 0.3, g.FIN_LEN]} position={[0, g.FIN_TOP + 0.75, g.FIN_LEN + 0.4]} leader={false}>{chip('Fin Width', false)}</CalloutLabel>
      <CalloutLabel anchor={[g.FIN_HW + 0.35, (g.OX_TOP + g.FIN_TOP) / 2, g.FIN_LEN]} position={[g.FIN_HW + 1.4, (g.OX_TOP + g.FIN_TOP) / 2, g.FIN_LEN]} leader={false}>{chip('Fin Height', false)}</CalloutLabel>
      <CalloutLabel anchor={[g.GATE_HW, g.GATE_TOP + 0.3, 0]} position={[g.GATE_HW + 1.3, g.GATE_TOP + 0.55, 0]} leader={false}>{chip('Gate Length', false)}</CalloutLabel>

      {/* no damping → no idle jitter; rotate/zoom lock while in cross-section */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        minDistance={5}
        maxDistance={18}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 + 0.1}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export function FinfetScene3D() {
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
    <Canvas frameloop="always" camera={{ position: [6.5, 4.2, 7.6], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      <Stage g={g} cross={cross} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
