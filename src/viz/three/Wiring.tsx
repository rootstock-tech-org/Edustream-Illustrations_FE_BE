'use client';
import { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import { color } from './palette';
import type { DeviceGeometry } from './geometry';
import { terminalX } from './ParametricTransistor';
import { WireFlow } from './WireFlow';
import { InlineVoltageEditor } from './InlineVoltageEditor';

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
  pullUpActivity,
  pullDownActivity,
  voutIntensity,
  reducedMotion,
}: {
  geometry: DeviceGeometry;
  nmosX: number;
  pmosX: number;
  deviceY: number;
  pullUpActivity: number;
  pullDownActivity: number;
  voutIntensity: number;
  reducedMotion: boolean;
}) {
  const metal = color('metal');
  const accent = color('current'); // teal current pulses (brand, distinct from diffusions)

  const tx = terminalX(geometry);
  const cY = deviceY + 0.24; // contact height
  const gndX = nmosX - tx - 0.7;
  const vddX = pmosX + tx + 0.7;
  const gateTopY = deviceY + 0.62;
  const inputY = deviceY + 1.25;

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
  const wOutStub: P3[] = [out, [0, deviceY - 0.95, 0]];

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

      {/* Power & input metal wires */}
      {[wGndSrc, wNDrnOut, wPDrnOut, wVddSrc, wOutStub, wInput, wInN, wInP].map((pts, i) => (
        <Line key={i} points={pts} color={metal} lineWidth={i >= 5 ? 4 : 3.5} />
      ))}

      {/* OUTPUT — centred junction of both drains */}
      <mesh position={out}>
        <sphereGeometry args={[0.14, 18, 18]} />
        <meshStandardMaterial color={voutColor} emissive={voutColor} emissiveIntensity={0.25 + voutIntensity * 1.0} metalness={0.4} roughness={0.4} />
      </mesh>
      {/* INPUT node */}
      <mesh position={[0, inputY, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={metal} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* CURRENT — red pulses, conducting half only, flowing toward GND */}
      <WireFlow points={wVddSrc.slice().reverse() as P3[]} activity={pullUpActivity} colorHex={accent} count={4} size={0.05} reducedMotion={reducedMotion} />
      <WireFlow points={wPDrnOut} activity={pullUpActivity} colorHex={accent} count={3} size={0.05} reducedMotion={reducedMotion} />
      <WireFlow points={wNDrnOut.slice().reverse() as P3[]} activity={pullDownActivity} colorHex={accent} count={3} size={0.05} reducedMotion={reducedMotion} />
      <WireFlow points={wGndSrc} activity={pullDownActivity} colorHex={accent} count={4} size={0.05} reducedMotion={reducedMotion} />

      {/* Labels / editable voltages */}
      <Html center distanceFactor={9} position={[gndX, cY - 0.4, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm">GND</span>
      </Html>
      <InlineVoltageEditor position={[vddX, cY + 0.4, 0]} paramKey="VDD" label="VDD" />
      <InlineVoltageEditor position={[0, inputY + 0.28, 0]} paramKey="Vin" label="INPUT" />
      <Html center distanceFactor={9} position={[0, deviceY - 1.2, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] text-white ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm">OUTPUT</span>
      </Html>
    </group>
  );
}
