'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type InstancedMesh, type MeshStandardMaterial } from 'three';
import type { DeviceGeometry } from './geometry';
import type { TransistorVisual } from './scene.types';
import { damp } from './anim';

const COLS = 18; // along the source→drain axis
const ROWS = 8; // across the width
const MAX = COLS * ROWS;
const SURFACE_Y = 0.05;

/**
 * Carriers drifting source→drain through the inversion channel, just beneath the
 * oxide. Count/opacity track `channelDensity` (engine-derived), so the channel
 * fills as V_GS crosses V_th; drift rate tracks current. NMOS carriers are
 * brighter red, PMOS deeper, and they drift in opposite directions. Decorative
 * only — seeded locally, never read back into state.
 */
export function ChannelField({
  visual,
  geometry,
  heat,
  reducedMotion,
}: {
  visual: TransistorVisual;
  geometry: DeviceGeometry;
  heat: number;
  reducedMotion: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const phase = useRef(0);
  const shown = useRef(0);

  const bases = useMemo(
    () =>
      Array.from({ length: MAX }, (_, i) => {
        const gx = i % COLS; // along channel
        const gz = Math.floor(i / COLS); // across width
        return {
          t0: gx / COLS,
          nz: (gz / (ROWS - 1) - 0.5) * 0.84 + (hash(i) - 0.5) * 0.05,
          jit: hash(i * 13 + 1),
        };
      }),
    [],
  );

  const drift = visual.type === 'nmos' ? 1 : -1;

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;

    shown.current = damp(shown.current, visual.channelDensity, reducedMotion ? 1e3 : 6, dt);
    const speed = reducedMotion ? 0 : 0.18 + visual.activity * 1.6;
    phase.current = (phase.current + dt * speed) % 1;

    const gateLen = 0.42 + geometry.channelLength * 0.5;
    const widthSpread = geometry.bodyWidth * 1.0;
    const size = 0.035 + visual.activity * 0.02;

    for (let i = 0; i < MAX; i++) {
      const b = bases[i]!;
      if (b.jit <= shown.current) {
        const t = (((b.t0 + phase.current * drift) % 1) + 1) % 1; // 0..1 along channel
        const jitter = reducedMotion ? 0 : (hash(i) - 0.5) * heat * 0.04;
        dummy.position.set((t - 0.5) * gateLen, SURFACE_Y + jitter, b.nz * widthSpread);
        dummy.scale.setScalar(size);
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;

    if (mat.current) {
      mat.current.opacity = damp(mat.current.opacity, 0.4 + shown.current * 0.6, 6, dt);
    }
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial ref={mat} color={visual.tint} emissive={visual.tint} emissiveIntensity={1.5} transparent opacity={0.7} />
    </instancedMesh>
  );
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
