'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { DeviceGeometry } from './geometry';
import { useLabModes } from './lab-modes';
import { REGION_INFO } from './anatomy-content';
import { color } from './palette';

/**
 * Engineering-textbook callouts: each region's label sits in a clear lane to the
 * left or right of the device, connected by a thin leader line to an anchor on
 * the actual structure — no overlapping chips on the device. In Learning mode
 * the callouts are clickable (click-to-pin); the selected region's leader +
 * anchor highlight and the others dim, isolating one structure at a time.
 */
interface RegionDef {
  key: string;
  lane: 'left' | 'right';
  order: number;
  anchor: (g: Geo) => [number, number, number];
}
interface Geo {
  deviceY: number;
  sx: number;
  frontZ: number;
}

const LEFT_X = -3.6;
const RIGHT_X = 3.6;
const STEP = 0.82;

// Anchors sit on the FRONT face of each real structure (z = frontZ) so the
// leader lines connect to what's actually visible, not the device's centre.
const REGIONS: RegionDef[] = [
  { key: 'gate', lane: 'left', order: 0, anchor: (g) => [-0.1, g.deviceY + 0.36, g.frontZ * 0.5] }, // pink poly gate
  { key: 'oxide', lane: 'left', order: 1, anchor: (g) => [0.2, g.deviceY + 0.18, g.frontZ] }, // gray oxide slab
  { key: 'source', lane: 'left', order: 2, anchor: (g) => [-g.sx, g.deviceY + 0.1, g.frontZ] }, // left diffusion
  { key: 'substrate', lane: 'left', order: 3, anchor: (g) => [-g.sx * 0.4, g.deviceY - 0.34, g.frontZ] }, // body
  { key: 'drain', lane: 'right', order: 0, anchor: (g) => [g.sx, g.deviceY + 0.1, g.frontZ] }, // right diffusion
  { key: 'channel', lane: 'right', order: 1, anchor: (g) => [0, g.deviceY - 0.04, g.frontZ * 0.5] }, // under the gate
];

export function AnatomyOverlay({ geometry, deviceY }: { geometry: DeviceGeometry; deviceY: number }) {
  const anatomy = useLabModes((s) => s.anatomy);
  const learning = useLabModes((s) => s.learning);
  const selected = useLabModes((s) => s.selected);
  const setSelected = useLabModes((s) => s.setSelected);
  if (!anatomy && !learning) return null;

  const L = geometry.channelLength;
  const span = 1.25 + L * 1.0;
  const padX = 0.42 + L * 0.08;
  const depth = geometry.bodyWidth * 1.05;
  const g: Geo = { deviceY, sx: span / 2 - padX / 2, frontZ: depth / 2 + 0.04 };

  const labelY = (lane: 'left' | 'right', order: number) => deviceY + (lane === 'left' ? 1.3 : 0.9) - order * STEP;

  return (
    <>
      {REGIONS.map((r) => {
        const info = REGION_INFO[r.key];
        if (!info) return null;
        const a = r.anchor(g);
        const lx = r.lane === 'left' ? LEFT_X : RIGHT_X;
        const ly = labelY(r.lane, r.order);
        const labelPos: [number, number, number] = [lx, ly, 0];
        const isSel = selected === r.key;
        const dimmed = learning && selected != null && !isSel;
        const lineColor = isSel ? color('accent') : '#9aa0ac';

        return (
          <group key={r.key}>
            <Line points={[a, [lx + (r.lane === 'left' ? 0.45 : -0.45), ly, 0]]} color={lineColor} lineWidth={isSel ? 2.5 : 1} transparent opacity={dimmed ? 0.25 : 0.9} />
            {isSel && <Anchor position={a} />}
            <Html center distanceFactor={8} position={labelPos} zIndexRange={[40, 0]}>
              <button
                onClick={() => learning && setSelected(isSel ? null : r.key)}
                style={{ opacity: dimmed ? 0.4 : 1, cursor: learning ? 'pointer' : 'default' }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] backdrop-blur-sm transition ${
                  isSel ? 'bg-accent/90 ring-1 ring-white/30' : 'bg-black/70 ring-1 ring-white/15'
                }`}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: isSel ? '#fff' : color('accent') }} />
                <span className="eyebrow text-[9px] text-white">{info.term}</span>
              </button>
            </Html>
          </group>
        );
      })}
    </>
  );
}

/** Pulsing ring at the selected region's anchor. */
function Anchor({ position }: { position: [number, number, number] }) {
  const ref = useRef<Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (ref.current) ref.current.scale.setScalar(0.09 + Math.sin(t.current * 4) * 0.03);
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[1, 14, 14]} />
      <meshStandardMaterial color={color('accent')} emissive={color('accent')} emissiveIntensity={1.4} />
    </mesh>
  );
}
