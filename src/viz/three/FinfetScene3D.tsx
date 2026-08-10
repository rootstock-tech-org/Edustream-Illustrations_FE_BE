'use client';
import { useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as THREE from 'three';
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

// Shared device palette (matches src/viz/three/palette.ts) so FinFET reads the
// same as NMOS/PMOS/CMOS/MOSFET: silicon gray, oxide cyan, red poly gate.
const C = {
  substrate: '#dad9d3',
  fin: '#e4e3dd',
  oxide: '#86d7e6',
  gate: '#d23b2d',
  edge: '#3a4250',
};

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

// three.js: X = fin width, Y = up, Z = source→drain length
function geom(L: number, W: number, Tox: number) {
  const GATE_HL = clamp(0.15, 1.1, (L / 180e-9) * 0.5); // half gate length along fin ← L
  const FIN_TOP = clamp(0.3, 2.1, (W / 1e-6) * 1.1); // fin height ← W
  const OX_TOP = clamp(0.08, 0.5, (Tox / 4e-9) * 0.22); // oxide thickness ← Tox
  const FIN_HW = clamp(0.16, 0.5, (W / 1e-6) * 0.26); // half fin width ← W (W_eff scales the fin)
  const SUB_HALF = 1.9;
  const SUB_BOT = -1.4;
  const FIN_LEN = 1.6; // half length
  const GATE_HW = clamp(0.7, 1.15, FIN_HW + 0.6); // gate stays wider than the fin it wraps
  const GATE_TOP = FIN_TOP + 0.5;
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
    cam.position.y = damp(cam.position.y, 0.7, k, dt);
    cam.position.z = damp(cam.position.z, 6.4, k, dt);
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

type P3 = [number, number, number];

// A 3D arrow (single- or double-headed) built from a shaft + cone heads, so it
// lives in world space and stays glued to the geometry while the model rotates.
function Arrow({ from, to, both = false, color = '#0b1220', r = 0.02, head = 0.12 }: {
  from: P3; to: P3; both?: boolean; color?: string; r?: number; head?: number;
}) {
  const { mid, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    return { mid: m, quat: q, len: length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  const shaft = Math.max(0.001, len - head * (both ? 2 : 1));
  return (
    <group position={mid} quaternion={quat}>
      <mesh position={[0, both ? 0 : -head / 2, 0]}>
        <cylinderGeometry args={[r, r, shaft, 10]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      {/* head at the `to` end */}
      <mesh position={[0, len / 2 - head / 2, 0]}>
        <coneGeometry args={[head * 0.55, head, 14]} />
        <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </mesh>
      {/* head at the `from` end (double-headed only) */}
      {both && (
        <mesh position={[0, -len / 2 + head / 2, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[head * 0.55, head, 14]} />
          <meshBasicMaterial color={color} depthTest={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Stage({ g, cross, reducedMotion, light }: { g: Geom; cross: boolean; reducedMotion: boolean; light: boolean }) {
  // arrows sit on the model AND cross into open space, so pick a color that
  // contrasts every surface (grey silicon, orange oxide, blue gate) and the bg:
  // dark ink on light theme; a mid-slate on dark that reads darker than the
  // silicon yet stays visible against the near-black background
  const arrowColor = light ? '#0b1220' : '#5a6474';
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

      {/* ---- dimension arrows (double-headed), glued onto the geometry ---- */}
      {/* Fin Width: across the top of the fin (X axis), on the exposed front span */}
      <Arrow color={arrowColor} both from={[-g.FIN_HW, g.FIN_TOP + 0.04, (g.GATE_HL + g.FIN_LEN) / 2]} to={[g.FIN_HW, g.FIN_TOP + 0.04, (g.GATE_HL + g.FIN_LEN) / 2]} />
      {/* Fin Height: vertical on the fin front face (oxide top → fin top) */}
      <Arrow color={arrowColor} both from={[-g.FIN_HW - 0.04, g.OX_TOP, g.FIN_LEN]} to={[-g.FIN_HW - 0.04, g.FIN_TOP, g.FIN_LEN]} />
      {/* Gate Length: along the gate right face (Z axis = source→drain) */}
      <Arrow color={arrowColor} both from={[g.GATE_HW + 0.04, g.GATE_TOP * 0.55, -g.GATE_HL]} to={[g.GATE_HW + 0.04, g.GATE_TOP * 0.55, g.GATE_HL]} />

      {/* ---- leader arrows (single-headed) pointing at each named part ---- */}
      {/* Gate → blue slab top */}
      <Arrow color={arrowColor} from={[-g.GATE_HW - 1.15, g.GATE_TOP + 0.35, g.GATE_HL]} to={[-g.GATE_HW * 0.3, g.GATE_TOP, g.GATE_HL]} />
      {/* Source → front fin nub */}
      <Arrow color={arrowColor} from={[-g.FIN_HW - 1.5, g.FIN_TOP * 0.85, (g.GATE_HL + g.FIN_LEN) / 2]} to={[-g.FIN_HW - 0.02, g.FIN_TOP * 0.85, (g.GATE_HL + g.FIN_LEN) / 2]} />
      {/* Drain → back fin nub */}
      <Arrow color={arrowColor} from={[g.FIN_HW + 1.5, g.FIN_TOP * 0.9, -g.FIN_LEN]} to={[g.FIN_HW + 0.02, g.FIN_TOP * 0.9, -g.FIN_LEN]} />
      {/* Oxide → right face of the orange band */}
      <Arrow color={arrowColor} from={[g.SUB_HALF + 1.3, g.OX_TOP * 0.5, -g.SUB_HALF * 0.25]} to={[g.SUB_HALF + 0.02, g.OX_TOP * 0.5, -g.SUB_HALF * 0.25]} />

      {/* ---- text labels (billboards) sitting at each arrow tail ---- */}
      <CalloutLabel anchor={[0, 0, 0]} position={[-g.GATE_HW - 1.5, g.GATE_TOP + 0.45, g.GATE_HL]} leader={false}>{chip('Gate')}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[-g.FIN_HW - 2.05, g.FIN_TOP * 0.85, (g.GATE_HL + g.FIN_LEN) / 2]} leader={false}>{chip('Source')}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[g.FIN_HW + 2.0, g.FIN_TOP * 0.95, -g.FIN_LEN]} leader={false}>{chip('Drain')}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[g.SUB_HALF + 1.75, g.OX_TOP * 0.5, -g.SUB_HALF * 0.25]} leader={false}>{chip('Oxide')}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[0, g.SUB_BOT * 0.5, g.SUB_HALF + 0.06]} leader={false}>{chip('Silicon Substrate')}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[0.1, g.FIN_TOP + 0.42, (g.GATE_HL + g.FIN_LEN) / 2 + 0.2]} leader={false}>{chip('Fin Width', false)}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[-g.FIN_HW - 0.95, g.OX_TOP + 0.05, g.FIN_LEN]} leader={false}>{chip('Fin Height', false)}</CalloutLabel>
      <CalloutLabel anchor={[0, 0, 0]} position={[g.GATE_HW + 0.72, g.GATE_TOP * 0.9, 0.15]} leader={false}>{chip('Gate Length', false)}</CalloutLabel>

      {/* no damping → no idle jitter; scroll-to-zoom always on, rotate locked in cross-section */}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom
        zoomToCursor
        minDistance={3.5}
        maxDistance={20}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 + 0.1}
        minAzimuthAngle={-0.45}
        maxAzimuthAngle={0.45}
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
    <Canvas frameloop="always" camera={{ position: [4.5, 2.7, 5.3], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      <Stage g={g} cross={cross} reducedMotion={reducedMotion} light={light} />
    </Canvas>
  );
}
