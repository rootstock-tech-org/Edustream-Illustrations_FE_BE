'use client';
import { Html, Line } from '@react-three/drei';

/**
 * A label placed in a clear margin/lane and tied to its feature by a thin leader
 * line — so labels never sit on top of the device geometry. `anchor` is the
 * feature point on the device; `position` is the clear zone the chip lives in.
 */
export function CalloutLabel({
  anchor,
  position,
  children,
  leader = true,
}: {
  anchor: [number, number, number];
  position: [number, number, number];
  children: React.ReactNode;
  leader?: boolean;
}) {
  return (
    <group>
      {leader && <Line points={[anchor, position]} color="#9aa0ac" lineWidth={1} transparent opacity={0.5} />}
      <Html center distanceFactor={9} position={position} zIndexRange={[30, 0]}>
        {children}
      </Html>
    </group>
  );
}
