'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { damp } from './anim';

/**
 * Voltage/current field cues at the output node. The core glows white→red with
 * Vout; its halo scales with supply field strength; a faint red leakage path
 * appears only when the engine's leakage is meaningful. All intensities are
 * engine readings.
 */
const WHITE = new Color('#ffffff');
const RED = new Color('#6a40b8'); // VOUT is purple metal (reference); high → white

export function FieldEffects({
  voutIntensity,
  fieldStrength,
  leakageVisibility,
  reducedMotion,
}: {
  voutIntensity: number;
  fieldStrength: number;
  leakageVisibility: number;
  reducedMotion: boolean;
}) {
  const core = useRef<MeshStandardMaterial>(null);
  const halo = useRef<Mesh>(null);
  const haloMat = useRef<MeshBasicMaterial>(null);
  const leak = useRef<MeshBasicMaterial>(null);

  useFrame((_, dt) => {
    const l = reducedMotion ? 1e3 : 6;
    if (core.current) {
      core.current.emissiveIntensity = damp(core.current.emissiveIntensity, 0.2 + voutIntensity * 1.9, l, dt);
      // Output low = deep red; output high = white-hot.
      (core.current.color as Color).lerpColors(RED, WHITE, voutIntensity);
      (core.current.emissive as Color).lerpColors(RED, WHITE, voutIntensity);
    }
    if (halo.current) {
      const s = 1 + fieldStrength * 1.7 * (0.4 + voutIntensity);
      halo.current.scale.setScalar(damp(halo.current.scale.x, s, l, dt));
    }
    if (haloMat.current) haloMat.current.opacity = damp(haloMat.current.opacity, 0.08 + voutIntensity * 0.24, l, dt);
    if (leak.current) leak.current.opacity = damp(leak.current.opacity, leakageVisibility * 0.55, l, dt);
  });

  return (
    <group>
      {/* OUT is a modest node — it SUPPORTS the story, it must not dominate it. */}
      <mesh>
        <sphereGeometry args={[0.17, 24, 24]} />
        <meshStandardMaterial ref={core} color="#6a40b8" emissive="#6a40b8" emissiveIntensity={0.2} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh ref={halo}>
        <sphereGeometry args={[0.26, 20, 20]} />
        <meshBasicMaterial ref={haloMat} color="#6a40b8" transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <Html center distanceFactor={10} position={[0.42, 0, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/55 px-1.5 py-0.5 text-[8px] text-white backdrop-blur-sm">VOUT</span>
      </Html>

      {/* faint leakage trickle along the spine when the off device leaks */}
      <mesh position={[0.16, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 3.2, 6]} />
        <meshBasicMaterial ref={leak} color="#df2531" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
