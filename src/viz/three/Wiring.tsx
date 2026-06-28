'use client';
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { color } from './palette';
import type { DeviceGeometry } from './geometry';
import { terminalX } from './ParametricTransistor';
import { WireFlow } from './WireFlow';
import { InlineVoltageEditor } from './InlineVoltageEditor';
import { CalloutLabel } from './CalloutLabel';

/**
 * Reference CMOS-inverter wiring (horizontal), matching the textbook photo:
 * pMOS (in the n-well) on the LEFT tied to VDD/1 V, nMOS on the RIGHT tied to
 * GND/0 V. Terminal ROLE is structural — SOURCE = OUTER (toward the rail),
 * DRAIN = INNER (toward the centred OUTPUT) — derived from sign(x) below, so the
 * topology holds whichever way round the devices sit:
 *   pMOS: source = OUTER → VDD,  drain = INNER → OUTPUT
 *   nMOS: source = OUTER → GND,  drain = INNER → OUTPUT
 * OUTPUT is the centred junction of the two drains; INPUT is the shared gate
 * over both. Current rides the conducting half only:
 *   Input=0 → VDD → pMOS → Output ;  Input=1 → Output → nMOS → GND.
 * Body/well taps are intentionally omitted to match the academically-approved
 * reference (only S/D terminals, gates, and I/O are drawn).
 */
type P3 = [number, number, number];

export function Wiring({
  geometry,
  nmosX,
  pmosX,
  deviceY,
  nmosBodyX,
  pmosWellX,
  pullUpActivity,
  pullDownActivity,
  voutIntensity,
  reducedMotion,
}: {
  geometry: DeviceGeometry;
  nmosX: number;
  pmosX: number;
  deviceY: number;
  nmosBodyX: number;
  pmosWellX: number;
  pullUpActivity: number;
  pullDownActivity: number;
  voutIntensity: number;
  reducedMotion: boolean;
}) {
  const metal = color('metal');
  const accent = color('current'); // teal current pulses (brand, distinct from diffusions)

  const tx = terminalX(geometry);
  const cY = deviceY + 0.24; // contact height
  // Rail terminals sit OUTBOARD of each transistor's source (the offset follows
  // the device's own side via sign, so the rails stay outboard whichever way the
  // nMOS/pMOS are placed). nmosBodyX / pmosWellX mark those outer rail positions.
  const gndX = nmosBodyX + (Math.sign(nmosBodyX) || -1) * 0.35;
  const vddX = pmosWellX + (Math.sign(pmosWellX) || 1) * 0.35;
  const gateTopY = deviceY + 0.42; // meets the gate's metal contact
  const inputY = deviceY + 1.1;

  // Terminal ROLE is structural, not positional: for EACH device the SOURCE sits
  // on the OUTER side (toward its own supply rail) and the DRAIN on the INNER side
  // (toward the shared OUTPUT at x=0). Deriving the sides from sign(x) keeps the
  // wiring correct whichever way round the nMOS/pMOS are placed (e.g. pMOS-left /
  // nMOS-right per the reference photo, or the mirror image).
  const nOuter = Math.sign(nmosX) || 1;
  const pOuter = Math.sign(pmosX) || 1;
  const nSrc: P3 = [nmosX + nOuter * tx, cY, 0]; // outer → GND
  const nDrn: P3 = [nmosX - nOuter * tx, cY, 0]; // inner → OUTPUT
  const pSrc: P3 = [pmosX + pOuter * tx, cY, 0]; // outer → VDD
  const pDrn: P3 = [pmosX - pOuter * tx, cY, 0]; // inner → OUTPUT
  const out: P3 = [0, cY, 0];

  // Power path.
  const wGndSrc: P3[] = [[gndX, cY, 0], nSrc];
  const wNDrnOut: P3[] = [nDrn, out];
  const wPDrnOut: P3[] = [pDrn, out];
  const wVddSrc: P3[] = [[vddX, cY, 0], pSrc];
  const wOutStub: P3[] = [out, [0, deviceY + 0.58, 0.35]];

  // Input (shared gate) — a metal comb to both gates.
  const wInput: P3[] = [[0, inputY, 0], [0, deviceY + 0.95, 0]];
  const wInN: P3[] = [[0, deviceY + 0.95, 0], [nmosX, deviceY + 0.95, 0], [nmosX, gateTopY, 0]];
  const wInP: P3[] = [[0, deviceY + 0.95, 0], [pmosX, deviceY + 0.95, 0], [pmosX, gateTopY, 0]];

  const voutColor = useMemo(() => {
    const t = Math.max(0, Math.min(1, voutIntensity));
    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    return `rgb(${lerp(120, 255)},${lerp(120, 255)},${lerp(140, 255)})`;
  }, [voutIntensity]);

  return (
    <group>
      {/* GND (left) & VDD (right) metal terminals */}
      <mesh position={[gndX, cY, 0]}>
        <boxGeometry args={[0.32, 0.3, 0.5]} />
        <meshStandardMaterial color={color('gnd')} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[vddX, cY, 0]}>
        <boxGeometry args={[0.32, 0.3, 0.5]} />
        <meshStandardMaterial color={color('vdd')} emissive={color('vdd')} emissiveIntensity={0.3} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Thin, recessive metal wires — supporting, not dominating (hierarchy #3/#4) */}
      {[wGndSrc, wNDrnOut, wPDrnOut, wVddSrc, wOutStub, wInput, wInN, wInP].map((pts, i) => (
        <Line key={i} points={pts} color={metal} lineWidth={i >= 5 ? 2.5 : 2} transparent opacity={0.85} />
      ))}


      {/* OUTPUT — the shared drain junction: an immediately identifiable glowing
          node + soft halo (hierarchy #2). */}
      <mesh position={out}>
        <sphereGeometry args={[0.2, 22, 22]} />
        <meshStandardMaterial color={voutColor} emissive={voutColor} emissiveIntensity={0.4 + voutIntensity * 1.1} metalness={0.3} roughness={0.35} />
      </mesh>
      <mesh position={out}>
        <sphereGeometry args={[0.34, 18, 18]} />
        <meshBasicMaterial color={voutColor} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* INPUT node */}
      <mesh position={[0, inputY, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={metal} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* CURRENT — pulses ride ONLY the drain↔OUTPUT links. The supply rails
          (VDD → pMOS source on the left, GND → nMOS source on the right) are left
          as STATIC wires — the connection is shown, but no flow animates on them. */}
      <WireFlow points={wPDrnOut} activity={pullUpActivity} colorHex={accent} count={2} size={0.038} reducedMotion={reducedMotion} />
      <WireFlow points={wNDrnOut.slice().reverse() as P3[]} activity={pullDownActivity} colorHex={accent} count={2} size={0.038} reducedMotion={reducedMotion} />

      {/* Labels in clear margins, tied to their node by a leader line */}
      <CalloutLabel anchor={[gndX, cY, 0]} position={[gndX - 0.7, 0.5, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm">GND</span>
      </CalloutLabel>
      <CalloutLabel anchor={[0, cY, 0]} position={[0, deviceY - 1.0, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-white ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm">OUTPUT</span>
      </CalloutLabel>
      <InlineVoltageEditor position={[vddX + 0.5, cY + 0.5, 0]} paramKey="VDD" label="VDD" />
      <InlineVoltageEditor position={[0, inputY + 0.35, 0]} paramKey="Vin" label="INPUT" />
    </group>
  );
}
