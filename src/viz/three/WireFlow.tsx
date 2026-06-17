'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Group, type Mesh } from 'three';

/**
 * Pulses that travel ALONG a wire's polyline (following every bend), so flow is
 * shown ON the conductor — never floating in space. Used with two visual
 * languages: red pulses for drain–source CURRENT on the VDD→OUT→GND path, and
 * purple pulses for the VIN gate SIGNAL on the gate wires. Speed/size scale with
 * `activity` (the engine's current).
 */
export function WireFlow({
  points,
  activity,
  colorHex = '#df2531',
  count = 6,
  size = 0.05,
  reducedMotion,
}: {
  points: [number, number, number][];
  activity: number;
  colorHex?: string;
  count?: number;
  size?: number;
  reducedMotion?: boolean;
}) {
  const group = useRef<Group>(null);
  const phase = useRef(0);

  const { segs, total } = useMemo(() => {
    const vs = points.map((p) => new Vector3(p[0], p[1], p[2]));
    const segs: { a: Vector3; b: Vector3; len: number }[] = [];
    let total = 0;
    for (let i = 0; i < vs.length - 1; i++) {
      const len = vs[i]!.distanceTo(vs[i + 1]!);
      segs.push({ a: vs[i]!, b: vs[i + 1]!, len });
      total += len;
    }
    return { segs, total };
  }, [points]);

  const posAt = (t: number, out: Vector3) => {
    let d = t * total;
    for (const s of segs) {
      if (d <= s.len || s === segs[segs.length - 1]) {
        const f = s.len ? Math.min(1, d / s.len) : 0;
        return out.copy(s.a).lerp(s.b, f);
      }
      d -= s.len;
    }
    return out;
  };

  const tmp = useMemo(() => new Vector3(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || total === 0) return;
    phase.current = (phase.current + dt * (reducedMotion ? 0 : 0.2 + activity * 1.2)) % 1;
    for (let i = 0; i < g.children.length; i++) {
      const t = (phase.current + i / count) % 1;
      const m = g.children[i] as Mesh;
      posAt(t, tmp);
      m.position.copy(tmp);
      m.visible = activity > 0.03;
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh key={i} scale={size}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial color={colorHex} emissive={colorHex} emissiveIntensity={1.9} />
        </mesh>
      ))}
    </group>
  );
}
