'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { DeviceGeometry } from './geometry';
import type { TransistorVisual } from './scene.types';
import { ParametricTransistor, terminalX, gateLength } from './ParametricTransistor';
import { CalloutLabel } from './CalloutLabel';
import { DimensionLines } from './DimensionLines';
import { DeviceHandles } from './DeviceHandles';
import { AnatomyOverlay } from './AnatomyOverlay';
import { useLabModes, crossSectionActive } from './lab-modes';
import { damp } from './anim';
import { useThemeStore } from '@/ui/theme';

/**
 * Eases the single-transistor camera between the 3D "Device" view and the flat
 * "Cross-section" view (a modest fov pulled back, not a tight telephoto, so the
 * whole device + its labels stay framed). Mirrors the inverter's rig.
 */
const DEVICE_FOV = 40;

function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    if (cross) {
      cam.position.x = damp(cam.position.x, 0, k, dt);
      cam.position.y = damp(cam.position.y, 0.15, k, dt);
      cam.position.z = damp(cam.position.z, 9.5, k, dt);
      cam.fov = damp(cam.fov, 30, k, dt);
      cam.updateProjectionMatrix();
    } else if (Math.abs(cam.fov - DEVICE_FOV) > 0.05) {
      cam.fov = damp(cam.fov, DEVICE_FOV, k, dt);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

/**
 * The single-transistor stage for the NMOS/PMOS explorers. ONE MOSFET, built
 * into its body (p-substrate for NMOS; an n-well embedded in the substrate for
 * PMOS — the complementary-placement teaching point), with its four terminals
 * — Gate, Source, Drain, Body — called out by leader lines. It reuses the exact
 * same `ParametricTransistor` (channel formation, gate stack, diffusions) as the
 * inverter, so the device a student meets here is the device inside the gate.
 */
export interface SingleTransistorData {
  readonly geometry: DeviceGeometry;
  readonly visual: TransistorVisual;
  readonly heat: number;
  readonly vgs: number;
  readonly vds: number;
  readonly lLabel: string;
  readonly wLabel: string;
  readonly reducedMotion: boolean;
}

const SUB_H = 0.6;
const WELL_H = 0.42;
const SUBSTRATE_MUTED = '#8a986d'; // muted sage (p-substrate)
const NWELL_MUTED = '#46618c'; // muted tech blue (n-well)

const GLOW_CYAN = '#7df9ff'; // neon-cyan signal colour — glow text on dark chips

const chip = (text: string, accent?: boolean) => (
  <span
    className="eyebrow select-none whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm"
    style={accent ? { color: GLOW_CYAN, textShadow: '0 0 8px rgba(125,249,255,0.55)' } : undefined}
  >
    {text}
  </span>
);

function Stage({ data }: { data: SingleTransistorData }) {
  const isP = data.visual.type === 'pmos';
  const depth = data.geometry.bodyWidth + 0.6;
  const tx = terminalX(data.geometry);
  const cY = 0.24;
  const bodyX = -(tx + 1.2);
  const contactCol = color('contact');
  const edge = color('edge');
  const rim = data.visual.activity;
  const cross = useLabModes(crossSectionActive);
  const anatomy = useLabModes((s) => s.anatomy);
  const learning = useLabModes((s) => s.learning);
  // In teaching modes the AnatomyOverlay supplies the region labels, so the
  // scene's own terminal callouts step aside to avoid double-labelling.
  const teaching = anatomy || learning;

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={18} color="#dfe8ff" />
      <pointLight position={[0, 0, 6]} intensity={3 + rim * 12} color={color('accent')} distance={20} />

      {/* Foundational p-substrate (recessive base) */}
      <mesh position={[0, -SUB_H / 2, 0]}>
        <boxGeometry args={[7, SUB_H, depth]} />
        <meshStandardMaterial color={SUBSTRATE_MUTED} roughness={0.95} metalness={0.02} />
        <Edges threshold={15} color={edge} />
      </mesh>
      {/* PMOS sits in an n-well embedded in the substrate (faces kept off the
          substrate planes + biased forward → no z-fight on rotation). */}
      {isP && (
        <mesh position={[0, 0.012 - WELL_H / 2, 0.12]}>
          <boxGeometry args={[tx * 2 + 2.2, WELL_H, depth - 0.2]} />
          <meshStandardMaterial color={NWELL_MUTED} roughness={0.9} metalness={0.03} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          <Edges threshold={15} color={edge} />
        </mesh>
      )}

      {/* Body / well tap → the substrate (NMOS) or n-well (PMOS) contact */}
      <group position={[bodyX, 0, 0]}>
        <mesh position={[0, -0.16, 0]}>
          <boxGeometry args={[0.42, 0.32, depth * 0.6]} />
          <meshStandardMaterial color={color(isP ? 'nplus' : 'pplus')} roughness={0.6} metalness={0.05} />
          <Edges threshold={15} color={edge} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.24, 0.14, 0.45]} />
          <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
          <Edges threshold={15} color={edge} />
        </mesh>
      </group>

      <ParametricTransistor position={[0, 0, 0]} geometry={data.geometry} visual={data.visual} heat={data.heat} reducedMotion={data.reducedMotion} />

      {/* Terminal callouts — NAMES ONLY, parked in clear margins with leader
          lines so nothing sits on the geometry (live V_GS / V_DS / region read
          out in the side panels, not on the stage). Hidden in teaching modes,
          where AnatomyOverlay labels the regions instead. */}
      {!teaching && (
        <>
          <CalloutLabel anchor={[0, 0.55, 0]} position={[0.35, 2.15, 0]}>{chip('Gate', true)}</CalloutLabel>
          <CalloutLabel anchor={[-tx, cY, 0]} position={[-tx - 0.55, 0.85, 0.6]}>{chip('Source')}</CalloutLabel>
          <CalloutLabel anchor={[tx, cY, 0]} position={[tx + 0.65, 0.85, 0.6]}>{chip('Drain')}</CalloutLabel>
          <CalloutLabel anchor={[bodyX, -0.1, 0]} position={[bodyX + 0.1, -0.78, 0.6]}>
            {chip(isP ? 'Body (n-well)' : 'Body (p-sub)')}
          </CalloutLabel>
        </>
      )}

      {/* L / W engineering dimension callouts */}
      {!cross && !teaching && (
        <DimensionLines
          gateLength={gateLength(data.geometry)}
          width={data.geometry.bodyWidth * 0.86}
          lLabel={data.lLabel}
          wLabel={data.wLabel}
        />
      )}

      {/* On-device W / L / Tox drag-grips (drag to adjust — pairs with the
          type/slider controls). Hidden in the flat/teaching views. */}
      {!cross && !teaching && <DeviceHandles geometry={data.geometry} position={[0, 0, 0]} />}

      {/* Engineering anatomy callouts (source/drain/gate/oxide/channel/body),
          shared with the inverter — self-hides unless Anatomy/Learning is on. */}
      <AnatomyOverlay geometry={data.geometry} deviceX={0} deviceY={0} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        minDistance={4}
        maxDistance={16}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 + 0.15}
        target={[0, 0.3, 0]}
      />
    </>
  );
}

export function SingleTransistorScene({ data }: { data: SingleTransistorData }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  return (
    <Canvas camera={{ position: [0, 1.1, 7.6], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} frameloop={data.reducedMotion ? 'demand' : 'always'}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 11, 22]} />
      <Stage data={data} />
    </Canvas>
  );
}
