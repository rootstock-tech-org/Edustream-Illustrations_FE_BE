'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { SceneData } from './scene.types';
import { ParametricTransistor } from './ParametricTransistor';
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
function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    const target = cross
      ? { x: 0, y: 0.1, z: 12, fov: 22 }
      : { x: 0, y: 1.4, z: 9.5, fov: 40 };
    cam.position.x = damp(cam.position.x, target.x, k, dt);
    cam.position.y = damp(cam.position.y, target.y, k, dt);
    cam.position.z = damp(cam.position.z, target.z, k, dt);
    cam.fov = damp(cam.fov, target.fov, k, dt);
    cam.updateProjectionMatrix();
  });
  return null;
}

export type { SceneData } from './scene.types';

const NMOS_X = -1.4; // nMOS on the left
const PMOS_X = 1.4; // pMOS on the right
const DEVICE_Y = 0;

/**
 * The interactive CMOS inverter stage in the reference layout: nMOS (left,
 * p-substrate) and pMOS (right, n-well) side-by-side on a shared p-substrate,
 * their inner drains meeting at the centred OUTPUT, sources reaching outward to
 * GND (left) and VDD (right), with the shared INPUT gate over both. Current
 * flows along VDD→pMOS→Output (Input=0) or Output→nMOS→GND (Input=1).
 */
function Stage({ data }: { data: SceneData }) {
  const accent = color('accent');
  const rim = data.pullUp.activity + data.pullDown.activity;
  const cross = useLabModes(crossSectionActive);
  const depth = data.geometry.bodyWidth + 0.6;

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={20} color="#dfe8ff" />
      <pointLight position={[0, 0, 6]} intensity={2 + rim * 12} color={accent} distance={20} />
      <pointLight position={[0, 0, 3]} intensity={data.heat * 30} color="#ffffff" distance={14} />

      {/* Shared p-substrate base under both devices */}
      <mesh position={[0, DEVICE_Y - 0.72, 0]}>
        <boxGeometry args={[6.4, 0.7, depth]} />
        <meshStandardMaterial color={color('substrate')} roughness={0.9} metalness={0.03} />
      </mesh>

      <Wiring
        geometry={data.geometry}
        nmosX={NMOS_X}
        pmosX={PMOS_X}
        deviceY={DEVICE_Y}
        /* Drive the current pulses by which device is CONDUCTING (channel
           formed), so Input=0 lights VDD→Output and Input=1 lights Output→GND;
           at the trip point both conduct = the genuine switching short-circuit. */
        pullUpActivity={data.pullUp.channelDensity}
        pullDownActivity={data.pullDown.channelDensity}
        voutIntensity={data.voutIntensity}
        reducedMotion={data.reducedMotion}
      />

      <ParametricTransistor position={[NMOS_X, DEVICE_Y, 0]} geometry={data.geometry} visual={data.pullDown} heat={data.heat} reducedMotion={data.reducedMotion} />
      <ParametricTransistor position={[PMOS_X, DEVICE_Y, 0]} geometry={data.geometry} visual={data.pullUp} heat={data.heat} reducedMotion={data.reducedMotion} />

      <DeviceHandles geometry={data.geometry} position={[PMOS_X, DEVICE_Y, 0]} />
      <AnatomyOverlay geometry={data.geometry} deviceX={NMOS_X} deviceY={DEVICE_Y} />

      <OrbitControls makeDefault enablePan={false} enableRotate={!cross} enableZoom={!cross} minDistance={6} maxDistance={20} target={[0, DEVICE_Y, 0]} />
    </>
  );
}

export function DeviceScene({ data }: { data: SceneData }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1ec' : '#09100c';
  return (
    <Canvas camera={{ position: [0, 1.4, 9.5], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} frameloop={data.reducedMotion ? 'demand' : 'always'}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 12, 24]} />
      <Stage data={data} />
    </Canvas>
  );
}
