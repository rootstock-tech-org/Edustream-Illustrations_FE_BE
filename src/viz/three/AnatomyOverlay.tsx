'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Mesh } from 'three';
import type { DeviceGeometry } from './geometry';
import { terminalX } from './ParametricTransistor';
import { useLabModes } from './lab-modes';
import { REGION_INFO } from './anatomy-content';
import { color } from './palette';

/**
 * Engineering callouts on the nMOS. SOURCE labels the OUTER (toward GND)
 * diffusion and DRAIN the INNER (toward OUTPUT) diffusion, so the structural
 * rule "source = terminal at its rail, drain = terminal at the shared node" is
 * taught — not left/right. Learning mode pins one region and dims the rest.
 */
interface Geo {
  dx: number;
  dy: number;
  tx: number;
  fz: number;
  o: number; // OUTER direction along x (+1 if the device sits right-of-centre, −1 if left)
}
interface RegionDef {
  key: string;
  anchor: (g: Geo) => [number, number, number];
  label: (g: Geo) => [number, number, number];
}

// Anchors/labels are expressed in the OUTER direction `o` (away from the centred
// OUTPUT), so SOURCE stays on the outer/rail side and DRAIN on the inner/output
// side, and the label cluster stays in the open outer margin — whichever side of
// the scene the nMOS is placed on (photo: nMOS on the right → o = +1).
const REGIONS: RegionDef[] = [
  { key: 'source', anchor: (g) => [g.dx + g.o * g.tx, g.dy + 0.14, g.fz], label: (g) => [g.dx + g.o * 2.5, g.dy + 0.0, 0] },
  { key: 'channel', anchor: (g) => [g.dx, g.dy + 0.02, g.fz], label: (g) => [g.dx + g.o * 2.5, g.dy + 0.85, 0] },
  { key: 'substrate', anchor: (g) => [g.dx, g.dy - 0.32, g.fz], label: (g) => [g.dx + g.o * 2.5, g.dy - 0.85, 0] },
  { key: 'gate', anchor: (g) => [g.dx, g.dy + 0.4, g.fz], label: (g) => [g.dx - g.o * 0.3, g.dy + 1.75, 0] },
  { key: 'oxide', anchor: (g) => [g.dx - g.o * 0.1, g.dy + 0.18, g.fz], label: (g) => [g.dx - g.o * 1.1, g.dy + 1.5, 0] },
  { key: 'drain', anchor: (g) => [g.dx - g.o * g.tx, g.dy + 0.14, g.fz], label: (g) => [g.dx - g.o * 1.6, g.dy + 0.9, 0] },
];

export function AnatomyOverlay({ geometry, deviceX, deviceY }: { geometry: DeviceGeometry; deviceX: number; deviceY: number }) {
  const anatomy = useLabModes((s) => s.anatomy);
  const learning = useLabModes((s) => s.learning);
  const selected = useLabModes((s) => s.selected);
  const setSelected = useLabModes((s) => s.setSelected);
  if (!anatomy && !learning) return null;

  const g: Geo = { dx: deviceX, dy: deviceY, tx: terminalX(geometry), fz: geometry.bodyWidth / 2 + 0.04, o: Math.sign(deviceX) || 1 };

  return (
    <>
      {REGIONS.map((r) => {
        const info = REGION_INFO[r.key];
        if (!info) return null;
        const a = r.anchor(g);
        const lp = r.label(g);
        const isSel = selected === r.key;
        const dimmed = learning && selected != null && !isSel;
        const lineColor = isSel ? color('accent') : '#9aa0ac';

        return (
          <group key={r.key}>
            <Line points={[a, lp]} color={lineColor} lineWidth={isSel ? 2.5 : 1} transparent opacity={dimmed ? 0.25 : 0.85} />
            {isSel && <Anchor position={a} />}
            <Html center distanceFactor={8} position={lp} zIndexRange={[40, 0]}>
              <button
                onClick={() => learning && setSelected(isSel ? null : r.key)}
                style={{ opacity: dimmed ? 0.4 : 1, cursor: learning ? 'pointer' : 'default' }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] backdrop-blur-sm transition ${
                  isSel ? 'bg-accent/90 ring-1 ring-white/30' : 'bg-black/70 ring-1 ring-black/15 dark:ring-white/15'
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
