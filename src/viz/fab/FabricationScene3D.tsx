'use client';
import { useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { Group } from 'three';
import { FAB_STAGES, FAB_STEPS, type FabStage, type FabStep } from '@/domain/education/fab-process';
import { useThemeStore } from '@/ui/theme';

/**
 * CMOS fabrication in 3D — a rotatable, step-by-step build modelled on a
 * cut-away cross-section: DOPING regions (epi, wells, S/D) are drawn as a
 * coloured cross-section on the FRONT face, while PHYSICAL layers (oxide,
 * nitride, poly, silicide, tungsten, metal, dielectric, passivation) are full
 * 3D — so it reads as a real 3D device with a visible section. Layers grow in
 * as their step runs, ions rain during implants, and the wafer auto-rotates.
 * Visibility is driven by the current step's stage, so every step is covered.
 */

// ── materials (reference palette) ────────────────────────────────────────────
const C = {
  substrate: '#6e6678',
  epi: '#8a8296',
  pwell: '#b08a50', // NMOS well (tan)
  nwell: '#6c8cb0', // PMOS well (blue)
  oxide: '#e0a43a',
  nitride: '#6fa96b',
  poly: '#e6853c',
  silicide: '#53a6a0',
  tungsten: '#6a7280',
  metal: '#b6c4d6',
  diel: '#e7dcc0',
  pass: '#9abfad',
  sdn: '#86add0', // n⁺
  sdp: '#ce9c82', // p⁺
  trench: '#2b3038',
  resist: '#ef3d86',
  ion: '#46cfe0',
  ionEmis: '#2aa6b8',
} as const;

// ── geometry (y = up, x = width, z = depth) ──────────────────────────────────
const HD = 4.5; // half depth
const FRONT = HD + 0.03; // front cross-section face
const XL = -9;
const XR = 9;
const gh = 1.3; // gate half-width
const xPMOS = -3; // PMOS gate centre (n-well, LEFT)
const xNMOS = 3; // NMOS gate centre (p-well, RIGHT)
const gP0 = xPMOS - gh, gP1 = xPMOS + gh, gN0 = xNMOS - gh, gN1 = xNMOS + gh;
const nwL = -5.4, nwR = -0.6; // n-well (PMOS, left)
const pwL = 0.6, pwR = 5.4; // p-well (NMOS, right)
const STI: ReadonlyArray<readonly [number, number]> = [
  [-6.6, -5.4],
  [-0.6, 0.6],
  [5.4, 6.6],
];
const sdP: ReadonlyArray<readonly [number, number]> = [[nwL, gP0], [gP1, nwR]]; // p⁺
const sdN: ReadonlyArray<readonly [number, number]> = [[pwL, gN0], [gN1, pwR]]; // n⁺
const plugX = [(nwL + gP0) / 2, (gP1 + nwR) / 2, (pwL + gN0) / 2, (gN1 + pwR) / 2];

type Corners = { x0: number; x1: number; y0: number; y1: number; z0?: number; z1?: number };

// a box that grows up from its base when it first appears
function BoxC({ x0, x1, y0, y1, z0 = -HD, z1 = HD, color, op = 1, metal = 0.15, rough = 0.62 }: Corners & {
  color: string; op?: number; metal?: number; rough?: number;
}) {
  const g = useRef<Group>(null);
  const p = useRef(0);
  const h = y1 - y0;
  useFrame((_, dt) => {
    if (!g.current || p.current >= 1) return;
    p.current = Math.min(1, p.current + dt * 4);
    g.current.scale.y = Math.max(0.001, p.current);
  });
  return (
    <group ref={g} position={[(x0 + x1) / 2, y0, (z0 + z1) / 2]} scale={[1, 0.001, 1]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[x1 - x0, h, z1 - z0]} />
        <meshStandardMaterial color={color} metalness={metal} roughness={rough} transparent={op < 1} opacity={op} depthWrite={op >= 0.98} />
      </mesh>
    </group>
  );
}

// a thin coloured cross-section "decal" on the front face (staggered in z)
function Plate({ x0, x1, y0, y1, color, zoff = 0, op = 1 }: Omit<Corners, 'z0' | 'z1'> & { color: string; zoff?: number; op?: number }) {
  return <BoxC x0={x0} x1={x1} y0={y0} y1={y1} z0={FRONT + zoff} z1={FRONT + zoff + 0.06} color={color} op={op} rough={0.7} metal={0.05} />;
}

// tungsten plug / via, grows up
function Cy({ x, z, y0, y1, r, color = C.tungsten }: { x: number; z: number; y0: number; y1: number; r: number; color?: string }) {
  const g = useRef<Group>(null);
  const p = useRef(0);
  const h = y1 - y0;
  useFrame((_, dt) => {
    if (!g.current || p.current >= 1) return;
    p.current = Math.min(1, p.current + dt * 4);
    g.current.scale.y = Math.max(0.001, p.current);
  });
  return (
    <group ref={g} position={[x, y0, z]} scale={[1, 0.001, 1]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r, r, h, 20]} />
        <meshStandardMaterial color={color} metalness={0.8} roughness={0.32} />
      </mesh>
    </group>
  );
}

// dopant ions raining onto the wafer during an implant
function IonDart({ x, z, phase }: { x: number; z: number; phase: number }) {
  const g = useRef<Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    g.current.position.y = 3.7 + ((state.clock.elapsedTime * 1.7 + phase) % 1.5) - 0.75;
  });
  return (
    <group ref={g} position={[x, 3, z]}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.28, 0.85, 16]} />
        <meshStandardMaterial color={C.ion} emissive={C.ionEmis} emissiveIntensity={0.5} metalness={0.3} roughness={0.3} />
      </mesh>
    </group>
  );
}
function Ions() {
  const xs = [-6.5, -5, -3.5, -2, -0.5, 1, 2.5, 4, 5.5];
  const zs = [-2.6, 0, 2.6];
  return <>{xs.flatMap((x, i) => zs.map((z, j) => <IonDart key={`${i}-${j}`} x={x} z={z} phase={i * 0.4 + j * 0.9} />))}</>;
}

// UV photolithography: a photomask hovering over the wafer + UV light beams
function UVExposure({ topY }: { topY: number }) {
  const beams = useRef<Group>(null);
  useFrame((state) => {
    if (beams.current) beams.current.scale.y = 0.9 + 0.12 * Math.sin(state.clock.elapsedTime * 7);
  });
  const slots = [-6.6, -5.4, -0.6, 0.6, 5.4, 6.6, -4.3, -1.7, 1.7, 4.3];
  return (
    <group>
      <mesh position={[0, 9.4, 0]}>
        <boxGeometry args={[XR - XL + 2, 0.4, HD * 2 + 1]} />
        <meshStandardMaterial color="#161d28" metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={beams} position={[0, topY, 0]}>
        {slots.map((x, k) => (
          <mesh key={k} position={[x, (9 - topY) / 2, 0]}>
            <boxGeometry args={[0.5, 9 - topY, HD * 2]} />
            <meshStandardMaterial color="#a488ff" emissive="#7a4dff" emissiveIntensity={0.9} transparent opacity={0.22} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// plasma dry-etch: a violet glow hovering over the surface
function PlasmaGlow({ topY }: { topY: number }) {
  const g = useRef<Group>(null);
  useFrame((state) => {
    if (g.current) g.current.scale.y = 1 + 0.18 * Math.sin(state.clock.elapsedTime * 9);
  });
  return (
    <group ref={g} position={[0, topY + 1.3, 0]}>
      <mesh>
        <boxGeometry args={[XR - XL, 2.6, HD * 2]} />
        <meshStandardMaterial color="#b06bff" emissive="#9a4dff" emissiveIntensity={0.7} transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

// rapid thermal anneal: a breathing orange heat aura around the wafer
function HeatGlow() {
  const g = useRef<Group>(null);
  useFrame((state) => {
    if (g.current) { const s = 1 + 0.05 * Math.sin(state.clock.elapsedTime * 4); g.current.scale.set(s, s, s); }
  });
  return (
    <group ref={g} position={[0, 1, 0]}>
      <mesh>
        <boxGeometry args={[XR - XL + 1.5, 9, HD * 2 + 1.5]} />
        <meshStandardMaterial color="#ff6a1a" emissive="#ff5510" emissiveIntensity={0.7} transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function chip(text: string): ReactNode {
  return (
    <span className="select-none whitespace-nowrap rounded-md bg-black/70 px-2 py-0.5 text-[9px] font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">
      {text}
    </span>
  );
}
function callout(text: string): ReactNode {
  return (
    <span className="select-none whitespace-nowrap rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_0_18px_var(--accent-glow)] ring-1 ring-white/25">
      {text}
    </span>
  );
}

type V3 = [number, number, number];
function stepAnchor(step: FabStep): V3 {
  const side = step.title.includes('PMOS') ? -3 : step.title.includes('NMOS') ? 3 : 0;
  switch (step.stage) {
    case 'wafer': return [0, -0.4, FRONT];
    case 'padox': return [0, 0.16, FRONT];
    case 'nitride': return [0, 0.5, FRONT];
    case 'trench': case 'liner': case 'fill': case 'cmp': return [0, -1.2, FRONT];
    case 'sti': return [0, 0.1, FRONT];
    case 'pwell': return [3, -1.4, FRONT];
    case 'nwell': return [-3, -1.4, FRONT];
    case 'gateox': return [0, 0.2, 0];
    case 'polydep': return [0, 0.9, 0];
    case 'gate': return [side || -3, 1.5, 0];
    case 'reox': return [-3, 1.6, 0];
    case 'sde': return [side || 3, -0.4, FRONT];
    case 'spacer': return [-3 - gh, 0.8, 0];
    case 'sd': return [side || 3, -1.0, FRONT];
    case 'silicide': return [-3, 1.7, 0];
    case 'bpsg': return [0, 2.4, 0];
    case 'contact': return [1.15, 1.6, 0];
    case 'metal1': return [-3, 3.5, 0];
    case 'imd': return [0, 4.6, 0];
    case 'metal2': return [0, 5.6, 0];
    case 'passiv': return [0, 7.7, 0];
    case 'pad': return [2.5, 7.5, 0];
    default: return [0, 1, 0];
  }
}

import { useAvsarStore } from '@/state/useAvsarStore';

function Model({ step }: { step: FabStep }) {
  const i = FAB_STAGES.indexOf(step.stage);
  const ge = (s: FabStage) => i >= FAB_STAGES.indexOf(s);
  const btw = (a: FabStage, b: FabStage) => ge(a) && !ge(b);
  const t = step.title;
  const has = (s: string) => t.includes(s);

  const stepIdx = FAB_STEPS.indexOf(step);
  const sacGrow = FAB_STEPS.findIndex((s) => s.title === 'Grow Sacrificial Oxide');
  const sacRemove = FAB_STEPS.findIndex((s) => s.title.startsWith('Remove Sacrificial'));
  const sacOx = sacGrow >= 0 && stepIdx >= sacGrow && stepIdx < sacRemove;

  const implant = has('Implant');
  const litho = has('Pattern Photoresist') || has('RAA Mask');
  const anneal = /Anneal/i.test(t);
  const dryEtch = has('Etch') && !has('Wet');
  const masking = /Pattern Photoresist|Mask|Etch/i.test(t) && !/Wet etch|Dry etch \(RIE\)$/.test(t);
  const resistTopY = ge('passiv') ? 7.95 : ge('metal2') ? 7.3 : ge('imd') ? 4.95 : ge('metal1') ? 3.62 : ge('bpsg') ? 3.0 : ge('gate') ? 1.4 : 0.5;
  const anchor = stepAnchor(step);
  
  const v = useAvsarStore((s) => s.wafer_state.visibleLayers);

  return (
    <group>
      {/* ── silicon body (physical) ─────────────────────────────────────── */}
      {v.silicon && <BoxC x0={XL} x1={XR} y0={-5} y1={0} color={C.substrate} rough={0.75} metal={0.08} />}
      {/* P⁻ epitaxial layer — cross-section, until the wells take over */}
      {v.silicon && !ge('pwell') && <Plate x0={XL} x1={XR} y0={-0.4} y1={0} color={C.epi} zoff={0} />}

      {/* ── STI films + trench + fill ───────────────────────────────────── */}
      {v.oxide && btw('padox', 'sti') && <BoxC x0={XL} x1={XR} y0={0} y1={0.16} color={C.oxide} rough={0.5} metal={0.12} />}
      {v.nitride && btw('nitride', 'sti') && <BoxC x0={XL} x1={XR} y0={0.16} y1={0.5} color={C.nitride} />}
      {v.silicon && btw('trench', 'fill') && STI.map(([a, b], k) => <Plate key={`tr-${k}`} x0={a} x1={b} y0={-2.8} y1={0} color={C.trench} zoff={0.06} />)}
      {v.oxide && ge('fill') && STI.map(([a, b], k) => <Plate key={`st-${k}`} x0={a} x1={b} y0={-2.8} y1={0} color={C.oxide} zoff={0.06} />)}
      {v.oxide && sacOx && <BoxC x0={XL} x1={XR} y0={0} y1={0.1} color={C.oxide} rough={0.5} metal={0.12} />}

      {/* ── retrograde wells (cross-section) ────────────────────────────── */}
      {v.doping && ge('nwell') && <Plate x0={nwL} x1={nwR} y0={-3} y1={0} color={C.nwell} zoff={0.12} />}
      {v.doping && ge('pwell') && <Plate x0={pwL} x1={pwR} y0={-3} y1={0} color={C.pwell} zoff={0.12} />}

      {/* ── gate oxide + poly ───────────────────────────────────────────── */}
      {v.oxide && ge('gateox') && !ge('bpsg') && <BoxC x0={nwL} x1={pwR} y0={0} y1={0.12} color={C.oxide} rough={0.5} metal={0.12} />}
      {v.poly && btw('polydep', 'gate') && <BoxC x0={-6.6} x1={6.6} y0={0.12} y1={1.4} color={C.poly} />}
      {v.poly && ge('gate') && (
        <>
          <BoxC x0={gP0} x1={gP1} y0={0.12} y1={1.4} color={C.poly} />
          <BoxC x0={gN0} x1={gN1} y0={0.12} y1={1.4} color={C.poly} />
        </>
      )}

      {/* ── S/D extensions → deep S/D (cross-section) ───────────────────── */}
      {v.doping && ge('sde') && (
        <>
          {sdP.map(([a, b], k) => <Plate key={`pe-${k}`} x0={a} x1={b} y0={-0.5} y1={0} color={C.sdp} zoff={0.18} />)}
          {sdN.map(([a, b], k) => <Plate key={`ne-${k}`} x0={a} x1={b} y0={-0.5} y1={0} color={C.sdn} zoff={0.18} />)}
        </>
      )}
      {v.nitride && ge('spacer') && ([[gP0 - 0.42, gP0], [gP1, gP1 + 0.42], [gN0 - 0.42, gN0], [gN1, gN1 + 0.42]] as [number, number][]).map(([a, b], k) => (
        <BoxC key={`sp-${k}`} x0={a} x1={b} y0={0.12} y1={1.0} color={C.nitride} />
      ))}
      {v.doping && ge('sd') && (
        <>
          {sdP.map(([a, b], k) => <Plate key={`pd-${k}`} x0={a + 0.02} x1={b - 0.02} y0={-1.15} y1={0} color={C.sdp} zoff={0.24} />)}
          {sdN.map(([a, b], k) => <Plate key={`nd-${k}`} x0={a + 0.02} x1={b - 0.02} y0={-1.15} y1={0} color={C.sdn} zoff={0.24} />)}
        </>
      )}

      {/* ── salicide (physical caps) ────────────────────────────────────── */}
      {v.metal && ge('silicide') && (
        <>
          <BoxC x0={gP0} x1={gP1} y0={1.4} y1={1.56} color={C.silicide} rough={0.32} metal={0.55} />
          <BoxC x0={gN0} x1={gN1} y0={1.4} y1={1.56} color={C.silicide} rough={0.32} metal={0.55} />
          {([[nwL, gP0 - 0.42], [gP1 + 0.42, nwR], [pwL, gN0 - 0.42], [gN1 + 0.42, pwR]] as [number, number][]).map(([a, b], k) => (
            <BoxC key={`sil-${k}`} x0={a} x1={b} y0={0.12} y1={0.26} color={C.silicide} rough={0.32} metal={0.55} />
          ))}
        </>
      )}

      {/* ── 1st interconnect: BPSG + W contacts + Metal-1 ───────────────── */}
      {v.oxide && ge('bpsg') && <BoxC x0={XL} x1={XR} y0={0} y1={3.0} color={C.diel} op={0.34} rough={0.4} />}
      {v.metal && ge('contact') && [-2.6, 0, 2.6].flatMap((z) => plugX.map((x) => <Cy key={`w-${x}-${z}`} x={x} z={z} y0={-0.2} y1={3.0} r={0.33} />))}
      {v.metal && ge('metal1') && plugX.map((x, k) => <BoxC key={`m1-${k}`} x0={x - 0.55} x1={x + 0.55} y0={3.0} y1={3.62} color={C.metal} metal={0.9} rough={0.22} />)}

      {/* ── upper interconnect: IMD + vias + M2 (perp) + M3 ─────────────── */}
      {v.oxide && ge('imd') && <BoxC x0={XL} x1={XR} y0={3.62} y1={4.95} color={C.diel} op={0.34} rough={0.4} />}
      {v.metal && ge('imd') && ([[-4.85, -2.4], [-4.85, 2.4], [4.85, -2.4], [4.85, 2.4]] as const).map(([x, z], k) => <Cy key={`v1-${k}`} x={x} z={z} y0={3.62} y1={4.95} r={0.3} />)}
      {v.metal && ge('metal2') && (
        <>
          {[-2.4, 2.4].map((z, k) => <BoxC key={`m2-${k}`} x0={-6} x1={6} y0={4.95} y1={5.6} z0={z - 0.55} z1={z + 0.55} color={C.metal} metal={0.9} rough={0.22} />)}
          <BoxC x0={XL} x1={XR} y0={5.6} y1={6.7} color={C.diel} op={0.34} rough={0.4} />
          {([[-3, -2.4], [-3, 2.4], [3, -2.4], [3, 2.4]] as const).map(([x, z], k) => <Cy key={`v2-${k}`} x={x} z={z} y0={5.6} y1={6.7} r={0.3} />)}
          {[-3, 3].map((x, k) => <BoxC key={`m3-${k}`} x0={x - 0.55} x1={x + 0.55} y0={6.7} y1={7.3} color={C.metal} metal={0.9} rough={0.22} />)}
        </>
      )}

      {/* ── passivation + bond pad ──────────────────────────────────────── */}
      {v.oxide && ge('passiv') && !ge('pad') && <BoxC x0={XL} x1={XR} y0={7.3} y1={7.95} color={C.pass} op={0.6} rough={0.4} />}
      {v.oxide && ge('pad') && (
        <>
          <BoxC x0={XL} x1={1.4} y0={7.3} y1={7.95} color={C.pass} op={0.6} rough={0.4} />
          <BoxC x0={3.6} x1={XR} y0={7.3} y1={7.95} color={C.pass} op={0.6} rough={0.4} />
        </>
      )}
      {v.metal && ge('pad') && <BoxC x0={1.4} x1={3.6} y0={7.3} y1={7.42} color={C.metal} metal={0.9} rough={0.22} />}

      {/* ── transient fab effects: resist / UV litho / plasma etch / ions / anneal ── */}
      {v.transient && masking && <BoxC x0={XL} x1={XR} y0={resistTopY} y1={resistTopY + 0.5} color={C.resist} op={0.55} rough={0.5} />}
      {v.transient && litho && <UVExposure topY={resistTopY} />}
      {v.transient && dryEtch && <PlasmaGlow topY={resistTopY} />}
      {v.transient && implant && <Ions />}
      {v.transient && anneal && <HeatGlow />}

      {/* ── current-step callout ────────────────────────────────────────── */}
      <mesh position={anchor}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#ffd24a" emissive="#ffcf3a" emissiveIntensity={0.9} />
      </mesh>
      <Html position={[anchor[0], anchor[1] + 0.8, anchor[2]]} center distanceFactor={20} zIndexRange={[50, 0]}>
        {callout(step.title)}
      </Html>
      {v.doping && ge('nwell') && !ge('bpsg') && <Html position={[-3, -1.6, FRONT]} center distanceFactor={18}>{chip('n-well · PMOS')}</Html>}
      {v.doping && ge('pwell') && !ge('bpsg') && <Html position={[3, -1.6, FRONT]} center distanceFactor={18}>{chip('p-well · NMOS')}</Html>}
    </group>
  );
}

export function FabricationScene3D({ step }: { step: FabStep }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#e9edf3' : '#0a111d';
  const grid1 = light ? '#c3ccd8' : '#24344c';
  const grid2 = light ? '#d8dfe8' : '#152134';

  return (
    <Canvas
      className="h-full w-full"
      camera={{ position: [19, 15, 24], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false }}
      frameloop="always"
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 45, 95]} />
      <hemisphereLight args={['#dfe9ff', '#2a2f3a', 0.65]} />
      <ambientLight intensity={0.24} />
      <directionalLight position={[14, 22, 16]} intensity={0.9} color="#ffffff" />
      <directionalLight position={[-14, 9, -10]} intensity={0.32} color="#bfd0ff" />
      <directionalLight position={[0, 6, -18]} intensity={0.28} color="#ffe6c2" />
      <gridHelper args={[90, 45, grid1, grid2]} position={[0, -5.05, 0]} />
      <Model step={step} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        autoRotate
        autoRotateSpeed={0.5}
        minDistance={14}
        maxDistance={70}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2 + 0.02}
        target={[0, 1.6, 0]}
      />
    </Canvas>
  );
}
