'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { SceneData } from './scene.types';
import { ParametricTransistor } from './ParametricTransistor';
import { FieldEffects } from './FieldEffects';
import { DeviceHandles } from './DeviceHandles';
import { AnatomyOverlay } from './AnatomyOverlay';
import { Wiring } from './Wiring';
import { useLabModes, crossSectionActive } from './lab-modes';
import { damp } from './anim';

/**
 * Eases the camera between a 3D "Device" view and a near-orthographic front
 * "Cross-section" view (low-fov telephoto ≈ flat textbook diagram). The
 * cross-section auto-engages whenever Anatomy or Learning is on.
 */
function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    const target = cross
      ? { x: 0, y: 0, z: 13, fov: 14 }
      : { x: 2.0, y: 0.7, z: 9, fov: 32 };
    cam.position.x = damp(cam.position.x, target.x, k, dt);
    cam.position.y = damp(cam.position.y, target.y, k, dt);
    cam.position.z = damp(cam.position.z, target.z, k, dt);
    cam.fov = damp(cam.fov, target.fov, k, dt);
    cam.updateProjectionMatrix();
  });
  return null;
}

export type { SceneData } from './scene.types';

const PMOS_Y = 0.8;
const NMOS_Y = -0.8;

/**
 * The interactive CMOS cross-section stage. PMOS pull-up above (in its n-well),
 * NMOS pull-down below, both gate-up like a fab diagram. The Wiring tells the
 * VDD▸PMOS▸VOUT▸NMOS▸GND story with a forked VIN to both gates and an animated
 * conducting path. Neutral lighting keeps the colour-coded anatomy readable.
 */
function Stage({ data }: { data: SceneData }) {
  const accent = color('accent');
  const rim = data.pullUp.activity + data.pullDown.activity;
  const cross = useLabModes(crossSectionActive);

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={20} color="#dfe8ff" />
      <pointLight position={[0, 0, 6]} intensity={2 + rim * 12} color={accent} distance={20} />
      <pointLight position={[0, 0, 3]} intensity={data.heat * 30} color="#ffffff" distance={14} />

      <Wiring pullUpActivity={data.pullUp.activity} pullDownActivity={data.pullDown.activity} fieldStrength={data.fieldStrength} reducedMotion={data.reducedMotion} />

      <ParametricTransistor position={[0, PMOS_Y, 0]} gateOnTop geometry={data.geometry} visual={data.pullUp} heat={data.heat} reducedMotion={data.reducedMotion} />
      <ParametricTransistor position={[0, NMOS_Y, 0]} gateOnTop geometry={data.geometry} visual={data.pullDown} heat={data.heat} reducedMotion={data.reducedMotion} />

      <FieldEffects voutIntensity={data.voutIntensity} fieldStrength={data.fieldStrength} leakageVisibility={data.leakageVisibility} reducedMotion={data.reducedMotion} />

      <DeviceHandles geometry={data.geometry} position={[0, PMOS_Y, 0]} />
      <AnatomyOverlay geometry={data.geometry} deviceY={NMOS_Y} />

      {/* In cross-section the camera is locked front-on (textbook view). */}
      <OrbitControls makeDefault enablePan={false} enableRotate={!cross} enableZoom={!cross} minDistance={6} maxDistance={20} target={[0, 0, 0]} />
    </>
  );
}

export function DeviceScene({ data }: { data: SceneData }) {
  return (
    <Canvas camera={{ position: [2.0, 0.7, 9], fov: 32 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} frameloop={data.reducedMotion ? 'demand' : 'always'}>
      <color attach="background" args={['#000000']} />
      <fog attach="fog" args={['#000000', 12, 24]} />
      <Stage data={data} />
    </Canvas>
  );
}
