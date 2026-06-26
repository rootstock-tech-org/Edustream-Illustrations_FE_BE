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
 * Reference CMOS-inverter wiring (horizontal). nMOS on the left, pMOS on the
 * right; terminal ROLE is structural:
 *   nMOS: source = OUTER-left → GND,   drain = INNER-right → OUTPUT
 *   pMOS: drain  = INNER-left → OUTPUT, source = OUTER-right → VDD
 * OUTPUT is the centred junction of the two drains; INPUT is the shared gate
 * over both. Current rides the conducting half only:
 *   Input=0 → VDD → pMOS → Output ;  Input=1 → Output → nMOS → GND.
 * (Bulk ties — pMOS n-well→VDD, nMOS substrate→GND — are reserved for later.)
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
  // Rails reach out past the body taps (p⁺→GND, n⁺→VDD) so the body is tied.
  const gndX = nmosBodyX - 0.35;
  const vddX = pmosWellX + 0.35;
  const gateTopY = deviceY + 0.42; // meets the gate's metal contact
  const inputY = deviceY + 1.1;

  // Terminals.
  const nSrc: P3 = [nmosX - tx, cY, 0];
  const nDrn: P3 = [nmosX + tx, cY, 0];
  const pDrn: P3 = [pmosX - tx, cY, 0];
  const pSrc: P3 = [pmosX + tx, cY, 0];
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

      {/* CURRENT — conventional current, conducting half only. Pull-up charges the
          output: VDD → pMOS → OUTPUT. Pull-down discharges it: OUTPUT → nMOS → GND.
          (WireFlow runs points[0] → points[last], so orient each wire accordingly.) */}
      <WireFlow points={wVddSrc} activity={pullUpActivity} colorHex={accent} count={3} size={0.038} reducedMotion={reducedMotion} />
      <WireFlow points={wPDrnOut} activity={pullUpActivity} colorHex={accent} count={2} size={0.038} reducedMotion={reducedMotion} />
      <WireFlow points={wNDrnOut.slice().reverse() as P3[]} activity={pullDownActivity} colorHex={accent} count={2} size={0.038} reducedMotion={reducedMotion} />
      <WireFlow points={wGndSrc.slice().reverse() as P3[]} activity={pullDownActivity} colorHex={accent} count={3} size={0.038} reducedMotion={reducedMotion} />

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
