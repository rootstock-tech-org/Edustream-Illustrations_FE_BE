'use client';
import type { DeviceGeometry } from './geometry';
import { gateLength, deviceHalfWidth } from './ParametricTransistor';
import { Handle } from './Handle';

/**
 * On-device geometry grips (attached to the pMOS): W resizes the device width
 * (depth), L the gate/channel length (horizontal), Tox the gate oxide. Each
 * edits the shared inverter parameter live.
 */
export function DeviceHandles({ geometry, position }: { geometry: DeviceGeometry; position: [number, number, number] }) {
  const gl = gateLength(geometry);
  const hw = deviceHalfWidth(geometry);
  const depth = geometry.bodyWidth;

  return (
    <group position={position}>
      {/* Width (depth) — drag at the front edge */}
      <Handle position={[0, 0.05, depth / 2 + 0.35]} axis="x" paramKey="W" label="W" dim={[[0, 0, -0.35], [0, 0, 0.35]]} />
      {/* Channel length — drag horizontally at the gate's right edge */}
      <Handle position={[gl / 2 + 0.3, 0.35, 0]} axis="x" paramKey="L" label="L" dim={[[-0.3, 0, 0], [0.3, 0, 0]]} />
      {/* Oxide thickness — drag vertically above the gate */}
      <Handle position={[-(hw + 0.35), 0.3, 0]} axis="y" paramKey="Tox" label="Tox" dim={[[0, -0.25, 0], [0, 0.25, 0]]} />
    </group>
  );
}
