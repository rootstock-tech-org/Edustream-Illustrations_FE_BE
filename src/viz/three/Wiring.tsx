'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Html } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';
import { color } from './palette';
import { WireFlow } from './WireFlow';
import { InlineVoltageEditor } from './InlineVoltageEditor';
import { damp } from './anim';

/**
 * The CMOS inverter wiring, tightened so PMOS and NMOS read as ONE coupled
 * circuit: VDD ▸ PMOS ▸ VOUT ▸ NMOS ▸ GND on a thin, recessive backbone with the
 * shared VOUT node directly between the devices. Two visual languages keep gate
 * signal and channel current distinct:
 *   • CURRENT  — red pulses on the VDD→OUT→GND path (only the conducting half).
 *   • VIN SIGNAL — purple pulses on the gate wires, riding the actual L-bend.
 */
const VDD_Y = 1.7;
const GND_Y = -1.7;
const VIN_X = -2.1;
const VIN_NODE_Y = 0.2;
const GATE_P_Y = 1.12; // PMOS gate (device at +0.8)
const GATE_N_Y = -0.48; // NMOS gate (device at -0.8)

export function Wiring({
  pullUpActivity,
  pullDownActivity,
  fieldStrength,
  reducedMotion,
}: {
  pullUpActivity: number;
  pullDownActivity: number;
  fieldStrength: number;
  reducedMotion: boolean;
}) {
  const topMat = useRef<MeshStandardMaterial>(null);
  const botMat = useRef<MeshStandardMaterial>(null);
  const accent = color('accent');
  const metal = color('metal');
  const vddCol = color('vdd');
  const gndCol = color('gnd');

  useFrame((_, dt) => {
    if (topMat.current) topMat.current.emissiveIntensity = damp(topMat.current.emissiveIntensity, 0.04 + pullUpActivity * 0.9, 6, dt);
    if (botMat.current) botMat.current.emissiveIntensity = damp(botMat.current.emissiveIntensity, 0.04 + pullDownActivity * 0.9, 6, dt);
  });

  const vinToP: [number, number, number][] = [[VIN_X, VIN_NODE_Y, 0], [VIN_X, GATE_P_Y, 0], [-0.12, GATE_P_Y, 0]];
  const vinToN: [number, number, number][] = [[VIN_X, VIN_NODE_Y, 0], [VIN_X, GATE_N_Y, 0], [-0.12, GATE_N_Y, 0]];

  return (
    <group>
      {/* VDD (red) / GND (black) rails — slimmer */}
      <mesh position={[0, VDD_Y, 0]}>
        <boxGeometry args={[3.6, 0.09, 0.34]} />
        <meshStandardMaterial color={vddCol} emissive={vddCol} emissiveIntensity={0.12 + fieldStrength * 0.5} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, GND_Y, 0]}>
        <boxGeometry args={[3.6, 0.09, 0.34]} />
        <meshStandardMaterial color={gndCol} metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Thin, recessive purple backbone (supports the story, doesn't dominate) */}
      <mesh position={[0, VDD_Y / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, VDD_Y, 10]} />
        <meshStandardMaterial ref={topMat} color={metal} emissive={accent} emissiveIntensity={0.04} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, GND_Y / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, -GND_Y, 10]} />
        <meshStandardMaterial ref={botMat} color={metal} emissive={accent} emissiveIntensity={0.04} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* CURRENT — red pulses on the conducting half of the backbone */}
      <WireFlow points={[[0, VDD_Y - 0.06, 0], [0, 0.16, 0]]} activity={pullUpActivity} colorHex={accent} count={5} size={0.055} reducedMotion={reducedMotion} />
      <WireFlow points={[[0, -0.16, 0], [0, GND_Y + 0.06, 0]]} activity={pullDownActivity} colorHex={accent} count={5} size={0.055} reducedMotion={reducedMotion} />

      {/* VIN bus — one node forks to BOTH gates (purple metal) */}
      <Line points={vinToP} color={metal} lineWidth={4} />
      <Line points={vinToN} color={metal} lineWidth={4} />
      <mesh position={[VIN_X, VIN_NODE_Y, 0]}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshStandardMaterial color={metal} emissive={metal} emissiveIntensity={0.6} />
      </mesh>

      {/* VIN SIGNAL — purple pulses riding the gate wires to both gates */}
      <WireFlow points={vinToP} activity={0.5} colorHex={metal} count={4} size={0.04} reducedMotion={reducedMotion} />
      <WireFlow points={vinToN} activity={0.5} colorHex={metal} count={4} size={0.04} reducedMotion={reducedMotion} />

      {/* Editable voltages + ground */}
      <InlineVoltageEditor position={[-1.5, VDD_Y + 0.05, 0]} paramKey="VDD" label="VDD" />
      <InlineVoltageEditor position={[VIN_X - 0.1, VIN_NODE_Y, 0]} paramKey="Vin" label="VIN" />
      <Html center distanceFactor={9} position={[-1.5, GND_Y - 0.05, 0]}>
        <span className="eyebrow select-none rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm">GND</span>
      </Html>
    </group>
  );
}
