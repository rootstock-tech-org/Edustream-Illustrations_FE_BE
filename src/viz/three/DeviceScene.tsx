'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { SceneData } from './scene.types';
import { ParametricTransistor, gateLength } from './ParametricTransistor';
import { DimensionLines } from './DimensionLines';
import { DeviceHandles } from './DeviceHandles';
import { AnatomyOverlay } from './AnatomyOverlay';
import { Wiring } from './Wiring';
import { useLabModes, crossSectionActive } from './lab-modes';
import { useThemeStore } from '@/ui/theme';
import { damp } from './anim';

/**
 * Eases the camera between a 3D "Device" view and a near-orthographic front
 * "Cross-section" view (low-fov telephoto ≈ flat textbook diagram). The
 * cross-section auto-engages whenever Anatomy or Learning is on.
 */
const DEVICE_FOV = 40;

function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    if (cross) {
      // Cross-section: front-locked (OrbitControls is disabled), so the rig owns
      // the camera — ease it to the flat textbook view. A modest fov pulled well
      // back (vs. a tight telephoto up close) keeps the near-orthographic look
      // WITHOUT magnifying the device off-frame — the whole inverter + its
      // callout labels stay inside the viewport.
      cam.position.x = damp(cam.position.x, 0, k, dt);
      cam.position.y = damp(cam.position.y, 0.2, k, dt);
      cam.position.z = damp(cam.position.z, 16.5, k, dt);
      cam.fov = damp(cam.fov, 26, k, dt);
      cam.updateProjectionMatrix();
    } else if (Math.abs(cam.fov - DEVICE_FOV) > 0.05) {
      // Device view: OrbitControls owns the POSITION (so the user can rotate
      // freely) — the rig only restores the fov after leaving cross-section.
      cam.fov = damp(cam.fov, DEVICE_FOV, k, dt);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

export type { SceneData } from './scene.types';

const NMOS_X = -2.4; // nMOS (over p-substrate, left)
const PMOS_X = 2.4; // pMOS (over n-well, right)
const DEVICE_Y = 0; // silicon surface
const NMOS_BODY_X = -3.7; // p⁺ body tap (substrate) → GND
const PMOS_WELL_X = 3.8; // n⁺ well contact (n-well) → VDD
// Substrate/well are thinned + muted so they RECEDE (hierarchy #5). The
// transistors read as the heroes against a recessive silicon base.
const SUB_H = 0.6;
const WELL_H = 0.42;
const WELL_LEFT = 0.1;
const SUBSTRATE_MUTED = '#8a986d'; // muted sage (p-substrate, recessive)
const NWELL_MUTED = '#46618c'; // muted tech blue (n-well, recessive)

/**
 * Physically-correct CMOS inverter (per the reference cross-section). One
 * foundational P-SUBSTRATE owns the scene; the N-WELL is EMBEDDED in its right
 * half (substrate wraps it below and to the left). NMOS n⁺ diffusions are
 * implanted in the p-substrate (left); PMOS p⁺ diffusions in the n-well (right).
 * Body taps are reserved: p⁺→GND in the substrate, n⁺→VDD in the n-well. The
 * shared inner drains meet at the centred OUTPUT; INPUT drives both gates.
 */
function Stage({ data }: { data: SceneData }) {
  const accent = color('accent');
  const rim = data.pullUp.activity + data.pullDown.activity;
  const cross = useLabModes(crossSectionActive);
  const depth = data.geometry.bodyWidth + 0.5;
  const contactCol = color('contact');
  const edge = color('edge');

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={20} color="#dfe8ff" />
      <pointLight position={[0, 0, 6]} intensity={2 + rim * 12} color={accent} distance={20} />
      <pointLight position={[0, 0, 3]} intensity={data.heat * 30} color="#ffffff" distance={14} />

      {/* Foundational P-SUBSTRATE — recessive base (muted + thin) */}
      <mesh position={[0, DEVICE_Y - SUB_H / 2, 0]}>
        <boxGeometry args={[10.4, SUB_H, depth]} />
        <meshStandardMaterial color={SUBSTRATE_MUTED} roughness={0.95} metalness={0.02} />
        <Edges threshold={15} color={edge} />
      </mesh>
      {/* N-WELL — embedded in the substrate's right half. Its faces are kept
          OFF the substrate's planes (top raised slightly, back pulled inside,
          front nudged forward) and biased forward via polygonOffset, so the two
          silicon volumes never z-fight (no flicker on rotation). */}
      <mesh position={[(WELL_LEFT + 5.0) / 2, 0.012 - WELL_H / 2, 0.12]}>
        <boxGeometry args={[5.0 - WELL_LEFT, WELL_H, depth - 0.2]} />
        <meshStandardMaterial color={NWELL_MUTED} roughness={0.9} metalness={0.03} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* Body taps (reserved): p⁺→GND in substrate, n⁺→VDD in n-well */}
      <BodyTap x={NMOS_BODY_X} depth={depth} diff={color('pplus')} contactCol={contactCol} />
      <BodyTap x={PMOS_WELL_X} depth={depth} diff={color('nplus')} contactCol={contactCol} />

      <Wiring
        geometry={data.geometry}
        nmosX={NMOS_X}
        pmosX={PMOS_X}
        deviceY={DEVICE_Y}
        nmosBodyX={NMOS_BODY_X}
        pmosWellX={PMOS_WELL_X}
        pullUpActivity={data.pullUp.channelDensity}
        pullDownActivity={data.pullDown.channelDensity}
        voutIntensity={data.voutIntensity}
        reducedMotion={data.reducedMotion}
      />

      <ParametricTransistor position={[NMOS_X, DEVICE_Y, 0]} geometry={data.geometry} visual={data.pullDown} heat={data.heat} reducedMotion={data.reducedMotion} />
      <ParametricTransistor position={[PMOS_X, DEVICE_Y, 0]} geometry={data.geometry} visual={data.pullUp} heat={data.heat} reducedMotion={data.reducedMotion} />

      {/* L / W engineering dimension callouts on the nMOS */}
      {!cross && (
        <DimensionLines
          position={[NMOS_X, DEVICE_Y, 0]}
          gateLength={gateLength(data.geometry)}
          width={data.geometry.bodyWidth * 0.86}
        />
      )}

      <DeviceHandles geometry={data.geometry} position={[PMOS_X, DEVICE_Y, 0]} />
      <AnatomyOverlay geometry={data.geometry} deviceX={NMOS_X} deviceY={DEVICE_Y} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        minDistance={5}
        maxDistance={22}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 + 0.15}
        // Bound the spin so device labels can never swing into the fixed
        // top-right schematic (still a clearly interactive 3D tilt/parallax).
        minAzimuthAngle={-0.45}
        maxAzimuthAngle={0.45}
        target={[0, 0.2, 0]}
      />
    </>
  );
}

/** A body/well contact tap: a small diffusion implanted in the silicon + metal. */
function BodyTap({ x, depth, diff, contactCol }: { x: number; depth: number; diff: string; contactCol: string }) {
  const edge = color('edge');
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, -0.16, 0]}>
        <boxGeometry args={[0.42, 0.32, depth * 0.7]} />
        <meshStandardMaterial color={diff} roughness={0.6} metalness={0.05} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[0.24, 0.14, 0.45]} />
        <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>
    </group>
  );
}

export function DeviceScene({ data }: { data: SceneData }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  return (
    <Canvas camera={{ position: [0, 0.9, 10.4], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} frameloop={data.reducedMotion ? 'demand' : 'always'}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 18, 42]} />
      <Stage data={data} />
    </Canvas>
  );
}
