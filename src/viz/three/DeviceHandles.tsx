'use client';
import type { DeviceGeometry } from './geometry';
import { Handle } from './Handle';

/**
 * The on-device geometry grips. Attached near the (un-mirrored) pull-up device,
 * they edit the SHARED W / L / Tox of the inverter directly. Dragging a grip
 * updates the parameter live, which flows through the existing pipeline to the
 * graphs and explanations — the device is the control panel.
 */
export function DeviceHandles({ geometry, position }: { geometry: DeviceGeometry; position: [number, number, number] }) {
  const L = geometry.channelLength;
  const gateLen = 0.42 + L * 0.5;
  const depth = geometry.bodyWidth * 1.15;
  const tox = geometry.oxideGap;

  const fz = depth / 2 * 0.55;
  return (
    <group position={position}>
      {/* Gate length — out to the RIGHT of the gate */}
      <Handle position={[gateLen / 2 + 0.5, 0.2, fz]} axis="x" paramKey="L" label="L" dim={[[-0.35, 0, 0], [0.35, 0, 0]]} />
      {/* Oxide thickness — out to the LEFT, above the oxide */}
      <Handle position={[-gateLen / 2 - 0.5, 0.24 + tox, fz]} axis="y" paramKey="Tox" label="Tox" dim={[[0, -0.22, 0], [0, 0.22, 0]]} />
      {/* Width / depth — at the FRONT-bottom edge */}
      <Handle position={[0, -0.18, depth / 2 + 0.35]} axis="x" paramKey="W" label="W" dim={[[0, 0, -0.4], [0, 0, 0.4]]} />
    </group>
  );
}
