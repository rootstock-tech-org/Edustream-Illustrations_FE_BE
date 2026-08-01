'use client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Color } from 'three';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { TransistorVisual } from './scene.types';
import { CalloutLabel } from './CalloutLabel';
import { damp } from './anim';
import { useLabModes, crossSectionActive } from './lab-modes';
import { useThemeStore } from '@/ui/theme';
import { voltageToIntensity } from '@/viz/mappers/encoding';

/**
 * Schematic 3D view of a true 2-input AND/OR gate built from static CMOS.
 * Static CMOS is inherently inverting, so AND/OR is two cascaded stages:
 *   Stage 1 (NAND for AND, NOR for OR) — the 4 transistors the engine solves.
 *   Stage 2 (a plain inverter) — flips stage 1's inverted node back to the
 *   true function. Both stages are drawn; channel glow on every transistor is
 *   a real reading of its simulated region/current (see GateSceneCard).
 */
export interface GateSceneData {
  readonly topology: 'and' | 'or';
  readonly vdd: number;
  /** Stage-1 output — the inverted (NAND/NOR) internal node. */
  readonly nodeVoltage: number;
  /** Stage-2 output — the true, final AND/OR value. */
  readonly outputVoltage: number;
  readonly MPA: TransistorVisual;
  readonly MPB: TransistorVisual;
  readonly MNA: TransistorVisual;
  readonly MNB: TransistorVisual;
  readonly MP2: TransistorVisual;
  readonly MN2: TransistorVisual;
  readonly reducedMotion: boolean;
}

const DEVICE_FOV = 40;

function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    if (cross) {
      cam.position.x = damp(cam.position.x, -1.6, k, dt);
      cam.position.y = damp(cam.position.y, 0.2, k, dt);
      cam.position.z = damp(cam.position.z, 15.5, k, dt);
      cam.fov = damp(cam.fov, 32, k, dt);
      cam.updateProjectionMatrix();
    } else if (Math.abs(cam.fov - DEVICE_FOV) > 0.05) {
      cam.fov = damp(cam.fov, DEVICE_FOV, k, dt);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

const chip = (text: string, accent = false) => (
  <span
    className="eyebrow select-none whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm"
    style={accent ? { color: '#7df9ff' } : undefined}
  >
    {text}
  </span>
);

type P3 = [number, number, number];

/** A thick, axis-aligned wire segment (never a thin Line — reads clearly as you rotate). */
function Bar({ from, to, thickness = 0.09, tint, glow = 0 }: { from: P3; to: P3; thickness?: number; tint: string; glow?: number }) {
  const [x0, y0, z0] = from;
  const [x1, y1, z1] = to;
  const mid: P3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const dz = Math.abs(z1 - z0);
  const args: P3 = dx >= dy && dx >= dz ? [Math.max(dx, 0.01), thickness, thickness] : dy >= dz ? [thickness, Math.max(dy, 0.01), thickness] : [thickness, thickness, Math.max(dz, 0.01)];
  return (
    <mesh position={mid}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.2 + glow * 0.9} metalness={0.35} roughness={0.5} />
    </mesh>
  );
}

function Node({ position, tint, glow = 0.5 }: { position: P3; tint: string; glow?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={0.4 + glow * 0.9} />
    </mesh>
  );
}

const OPEN_TINT = '#5a6274'; // muted grey — no inversion channel yet (matches an open circuit gap)

/**
 * One MOSFET drawn as its standard circuit-schematic symbol (drain lead → a
 * 3-segment broken channel → source lead, a gate plate held off the channel
 * by a visible oxide gap, and the textbook N-in / P-out polarity arrow on the
 * source) — the same reading used by real CMOS schematic tools. The channel
 * segments glow and tint from grey (open) to the carrier colour as
 * `channelDensity` rises — a real reading of the simulated state, not a fixed
 * on/off toggle.
 */
function TransistorBox({ position, visual, pinAxis }: { position: P3; visual: TransistorVisual; pinAxis: P3 }) {
  const poly = color('poly');
  const isN = visual.type === 'nmos';
  const glow = 0.25 + visual.channelDensity * 1.1;
  const segColor = new Color(OPEN_TINT).lerp(new Color(visual.tint), Math.min(1, visual.channelDensity + 0.15)).getStyle();
  const platePos = pinAxis.map((v) => v * 0.24) as P3; // gate plate, held off the channel by the oxide gap
  const leadPos = pinAxis.map((v) => v * 0.52) as P3; // lead out to the shared gate-drive bus
  return (
    <group position={position}>
      {/* drain / source leads (fixed) */}
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color={poly} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[0.05, 0.14, 0.05]} />
        <meshStandardMaterial color={poly} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* channel: 3 broken segments — bridge together (glow) as the channel forms */}
      {[0.14, 0, -0.14].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.07, 0.1, 0.07]} />
          <meshStandardMaterial color={segColor} emissive={segColor} emissiveIntensity={glow} metalness={0.25} roughness={0.4} />
        </mesh>
      ))}
      {/* polarity arrow on the source lead: NMOS points in, PMOS points out */}
      <mesh position={[0, -0.24, 0]} rotation={isN ? [0, 0, 0] : [Math.PI, 0, 0]}>
        <coneGeometry args={[0.05, 0.13, 10]} />
        <meshStandardMaterial color={poly} emissive={poly} emissiveIntensity={0.3} />
      </mesh>
      {/* gate plate, held off the channel by the oxide gap */}
      <mesh position={platePos}>
        <boxGeometry args={[0.05, 0.4, 0.28]} />
        <meshStandardMaterial color={poly} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* gate lead out to the shared A/B (or node1) bus wire */}
      <mesh position={leadPos}>
        <boxGeometry args={[0.28, 0.06, 0.06]} />
        <meshStandardMaterial color={poly} metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

// Layout constants — a fixed schematic grid, independent of device geometry
// (this is a topology diagram, not a physical cross-section).
const VDD_Y = 2.6;
const GND_Y = -2.6;
const NODE_Y = 0; // stage-1 output / stage-2 gate-drive level
const XA = -5.2; // "A" leg column (parallel arrangement)
const XB = -3.6; // "B" leg column (parallel arrangement)
const TRUNK_X = (XA + XB) / 2; // series column / node1 trunk
const STAGE2_GATE_X = -1.5;
const STAGE2_X = 0.7;
const OUTPUT_X = 2.5;
const RAIL_LEFT_X = -5.9;
const RAIL_RIGHT_X = STAGE2_X + 0.5;
const TOP_BOX_Y = (VDD_Y + NODE_Y) / 2;
const BOTTOM_BOX_Y = (NODE_Y + GND_Y) / 2;

function seriesPair(top: number, bottom: number): [number, number, number] {
  const mid = (top + bottom) / 2;
  return [(top + mid) / 2, (mid + bottom) / 2, mid];
}

function Stage({ data }: { data: GateSceneData }) {
  const cross = useLabModes(crossSectionActive);
  const metal = color('metal');
  const vddCol = color('vdd');
  const gndCol = color('gnd');
  const isAnd = data.topology === 'and';
  const nodeGlow = voltageToIntensity(data.nodeVoltage, data.vdd);
  const outGlow = voltageToIntensity(data.outputVoltage, data.vdd);

  // Pull-up (PMOS, top half) and pull-down (NMOS, bottom half): AND = NAND
  // (parallel PMOS / series NMOS); OR = NOR (series PMOS / parallel NMOS).
  const upArrangement = isAnd ? 'parallel' : 'series';
  const downArrangement = isAnd ? 'series' : 'parallel';

  const upBoxes: { pos: P3; visual: TransistorVisual }[] = [];
  const downBoxes: { pos: P3; visual: TransistorVisual }[] = [];
  const upWires: { from: P3; to: P3 }[] = [];
  const downWires: { from: P3; to: P3 }[] = [];
  let upMidNodeY: number | null = null;
  let downMidNodeY: number | null = null;

  if (upArrangement === 'parallel') {
    upBoxes.push({ pos: [XA, TOP_BOX_Y, 0], visual: data.MPA }, { pos: [XB, TOP_BOX_Y, 0], visual: data.MPB });
    upWires.push({ from: [XA, VDD_Y, 0], to: [XA, TOP_BOX_Y + 0.43, 0] }, { from: [XA, TOP_BOX_Y - 0.43, 0], to: [XA, NODE_Y, 0] });
    upWires.push({ from: [XB, VDD_Y, 0], to: [XB, TOP_BOX_Y + 0.43, 0] }, { from: [XB, TOP_BOX_Y - 0.43, 0], to: [XB, NODE_Y, 0] });
  } else {
    const [yTop, yBottom, mid] = seriesPair(VDD_Y, NODE_Y);
    upBoxes.push({ pos: [TRUNK_X, yTop, 0], visual: data.MPA }, { pos: [TRUNK_X, yBottom, 0], visual: data.MPB });
    upWires.push(
      { from: [TRUNK_X, VDD_Y, 0], to: [TRUNK_X, yTop + 0.43, 0] },
      { from: [TRUNK_X, yTop - 0.43, 0], to: [TRUNK_X, mid, 0] },
      { from: [TRUNK_X, mid, 0], to: [TRUNK_X, yBottom + 0.43, 0] },
      { from: [TRUNK_X, yBottom - 0.43, 0], to: [TRUNK_X, NODE_Y, 0] },
    );
    upMidNodeY = mid;
  }

  if (downArrangement === 'parallel') {
    downBoxes.push({ pos: [XA, BOTTOM_BOX_Y, 0], visual: data.MNA }, { pos: [XB, BOTTOM_BOX_Y, 0], visual: data.MNB });
    downWires.push({ from: [XA, NODE_Y, 0], to: [XA, BOTTOM_BOX_Y + 0.43, 0] }, { from: [XA, BOTTOM_BOX_Y - 0.43, 0], to: [XA, GND_Y, 0] });
    downWires.push({ from: [XB, NODE_Y, 0], to: [XB, BOTTOM_BOX_Y + 0.43, 0] }, { from: [XB, BOTTOM_BOX_Y - 0.43, 0], to: [XB, GND_Y, 0] });
  } else {
    const [yTop, yBottom, mid] = seriesPair(NODE_Y, GND_Y);
    downBoxes.push({ pos: [TRUNK_X, yTop, 0], visual: data.MNA }, { pos: [TRUNK_X, yBottom, 0], visual: data.MNB });
    downWires.push(
      { from: [TRUNK_X, NODE_Y, 0], to: [TRUNK_X, yTop + 0.43, 0] },
      { from: [TRUNK_X, yTop - 0.43, 0], to: [TRUNK_X, mid, 0] },
      { from: [TRUNK_X, mid, 0], to: [TRUNK_X, yBottom + 0.43, 0] },
      { from: [TRUNK_X, yBottom - 0.43, 0], to: [TRUNK_X, GND_Y, 0] },
    );
    downMidNodeY = mid;
  }

  const [gateAPos, gateBPos] = [upBoxes[0]!.pos, upBoxes[1]!.pos];
  const [gateAPosDown, gateBPosDown] = [downBoxes[0]!.pos, downBoxes[1]!.pos];

  const stage2Top: P3 = [STAGE2_X, TOP_BOX_Y, 0];
  const stage2Bottom: P3 = [STAGE2_X, BOTTOM_BOX_Y, 0];

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={16} color="#dfe8ff" />
      <pointLight position={[TRUNK_X, NODE_Y, 3]} intensity={2 + nodeGlow * 14} color={color('accent')} distance={16} />
      <pointLight position={[STAGE2_X, NODE_Y, 3]} intensity={2 + outGlow * 14} color={color('accent')} distance={16} />

      {/* VDD / GND rails span both stages */}
      <Bar from={[RAIL_LEFT_X, VDD_Y, 0]} to={[RAIL_RIGHT_X, VDD_Y, 0]} tint={vddCol} glow={0.6} thickness={0.1} />
      <Bar from={[RAIL_LEFT_X, GND_Y, 0]} to={[RAIL_RIGHT_X, GND_Y, 0]} tint={gndCol} glow={0.3} thickness={0.1} />
      <CalloutLabel anchor={[RAIL_LEFT_X, VDD_Y, 0]} position={[RAIL_LEFT_X - 0.1, VDD_Y + 0.45, 0]} leader={false}>{chip('VDD')}</CalloutLabel>
      <CalloutLabel anchor={[RAIL_LEFT_X, GND_Y, 0]} position={[RAIL_LEFT_X - 0.1, GND_Y - 0.45, 0]} leader={false}>{chip('GND')}</CalloutLabel>

      {/* Stage 1 wiring + transistors */}
      {[...upWires, ...downWires].map((w, i) => (
        <Bar key={`s1w${i}`} from={w.from} to={w.to} tint={metal} glow={0.2} />
      ))}
      <Bar from={[XA, NODE_Y, 0]} to={[XB, NODE_Y, 0]} tint={metal} glow={0.3 + nodeGlow * 0.5} />
      {upMidNodeY != null && <Node position={[TRUNK_X, upMidNodeY, 0]} tint={metal} glow={0.4} />}
      {downMidNodeY != null && <Node position={[TRUNK_X, downMidNodeY, 0]} tint={metal} glow={0.4} />}

      {upBoxes.map((b, i) => (
        <TransistorBox key={`up${i}`} position={b.pos} visual={b.visual} pinAxis={[-1, 0, 0]} />
      ))}
      {downBoxes.map((b, i) => (
        <TransistorBox key={`down${i}`} position={b.pos} visual={b.visual} pinAxis={[-1, 0, 0]} />
      ))}

      {/* Input pins + labels: A drives the first up/down leg, B the second */}
      <Bar from={[gateAPos[0] - 0.78, gateAPos[1], 0]} to={[gateAPos[0] - 0.78, gateAPosDown[1], 0]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateAPos[0] - 0.78, gateAPos[1], 0]} to={[gateAPos[0] - 0.63, gateAPos[1], 0]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateAPosDown[0] - 0.78, gateAPosDown[1], 0]} to={[gateAPosDown[0] - 0.63, gateAPosDown[1], 0]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <CalloutLabel anchor={[gateAPos[0] - 0.78, (gateAPos[1] + gateAPosDown[1]) / 2, 0]} position={[gateAPos[0] - 1.3, (gateAPos[1] + gateAPosDown[1]) / 2, 0]} leader={false}>{chip('A')}</CalloutLabel>

      <Bar from={[gateBPos[0] - 1.35, gateBPos[1], 0.55]} to={[gateBPos[0] - 1.35, gateBPosDown[1], 0.55]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateBPos[0] - 1.35, gateBPos[1], 0.55]} to={[gateBPos[0] - 0.63, gateBPos[1], 0.55]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateBPos[0] - 1.35, gateBPos[1], 0]} to={[gateBPos[0] - 1.35, gateBPos[1], 0.55]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateBPosDown[0] - 1.35, gateBPosDown[1], 0.55]} to={[gateBPosDown[0] - 0.63, gateBPosDown[1], 0.55]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <Bar from={[gateBPosDown[0] - 1.35, gateBPosDown[1], 0]} to={[gateBPosDown[0] - 1.35, gateBPosDown[1], 0.55]} tint={color('poly')} glow={0.2} thickness={0.06} />
      <CalloutLabel anchor={[gateBPos[0] - 1.35, (gateBPos[1] + gateBPosDown[1]) / 2, 0.55]} position={[gateBPos[0] - 1.85, (gateBPos[1] + gateBPosDown[1]) / 2, 0.55]} leader={false}>{chip('B')}</CalloutLabel>

      {/* Node1 — the inverted stage-1 output (NAND/NOR node) */}
      <Node position={[TRUNK_X, NODE_Y, 0]} tint={metal} glow={0.5 + nodeGlow * 0.5} />
      <Bar from={[XB, NODE_Y, 0]} to={[STAGE2_GATE_X, NODE_Y, 0]} tint={metal} glow={0.3 + nodeGlow * 0.6} />
      <CalloutLabel anchor={[TRUNK_X, NODE_Y, 0]} position={[TRUNK_X, NODE_Y - 0.55, 0]} leader={false}>{chip(isAnd ? 'NOT(A·B)' : 'NOT(A+B)')}</CalloutLabel>

      {/* Shared gate-drive bus into stage 2 (both stage-2 gates see node1) */}
      <Bar from={[STAGE2_GATE_X, TOP_BOX_Y, 0]} to={[STAGE2_GATE_X, BOTTOM_BOX_Y, 0]} tint={color('poly')} glow={0.25 + nodeGlow * 0.5} thickness={0.06} />
      <Bar from={[STAGE2_GATE_X, TOP_BOX_Y, 0]} to={[STAGE2_X - 0.55, TOP_BOX_Y, 0]} tint={color('poly')} glow={0.25 + nodeGlow * 0.5} thickness={0.06} />
      <Bar from={[STAGE2_GATE_X, BOTTOM_BOX_Y, 0]} to={[STAGE2_X - 0.55, BOTTOM_BOX_Y, 0]} tint={color('poly')} glow={0.25 + nodeGlow * 0.5} thickness={0.06} />

      {/* Stage 2 — the closing inverter */}
      <Bar from={[STAGE2_X, VDD_Y, 0]} to={[STAGE2_X, TOP_BOX_Y + 0.43, 0]} tint={metal} glow={0.2} />
      <Bar from={[STAGE2_X, TOP_BOX_Y - 0.43, 0]} to={[STAGE2_X, NODE_Y, 0]} tint={metal} glow={0.2 + outGlow * 0.5} />
      <Bar from={[STAGE2_X, NODE_Y, 0]} to={[STAGE2_X, BOTTOM_BOX_Y + 0.43, 0]} tint={metal} glow={0.2 + outGlow * 0.5} />
      <Bar from={[STAGE2_X, BOTTOM_BOX_Y - 0.43, 0]} to={[STAGE2_X, GND_Y, 0]} tint={metal} glow={0.2} />
      <TransistorBox position={stage2Top} visual={data.MP2} pinAxis={[-1, 0, 0]} />
      <TransistorBox position={stage2Bottom} visual={data.MN2} pinAxis={[-1, 0, 0]} />
      <Node position={[STAGE2_X, NODE_Y, 0]} tint={metal} glow={0.5 + outGlow * 0.5} />

      {/* Final output */}
      <Bar from={[STAGE2_X, NODE_Y, 0]} to={[OUTPUT_X, NODE_Y, 0]} tint={metal} glow={0.3 + outGlow * 0.6} />
      <Node position={[OUTPUT_X, NODE_Y, 0]} tint={metal} glow={0.5 + outGlow * 0.6} />
      <CalloutLabel anchor={[OUTPUT_X, NODE_Y, 0]} position={[OUTPUT_X + 0.55, NODE_Y + 0.35, 0]} leader={false}>{chip(`Y = ${isAnd ? 'A·B' : 'A+B'}`, true)}</CalloutLabel>

      {/* Stage titles */}
      <CalloutLabel anchor={[TRUNK_X, VDD_Y, 0]} position={[TRUNK_X, VDD_Y + 0.5, 0]} leader={false}>{chip(`Stage 1 — ${isAnd ? 'NAND' : 'NOR'}`)}</CalloutLabel>
      <CalloutLabel anchor={[STAGE2_X, VDD_Y, 0]} position={[STAGE2_X, VDD_Y + 0.5, 0]} leader={false}>{chip('Stage 2 — Inverter')}</CalloutLabel>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        minDistance={7}
        maxDistance={20}
        minPolarAngle={0.5}
        maxPolarAngle={Math.PI / 2 + 0.1}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
        target={[-0.9, 0.2, 0]}
      />
    </>
  );
}

export function GateScene({ data }: { data: GateSceneData }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  return (
    <Canvas camera={{ position: [-0.9, 1.4, 13.5], fov: DEVICE_FOV }} dpr={[1, 2]} gl={{ antialias: true, alpha: false }} frameloop={data.reducedMotion ? 'demand' : 'always'}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 18, 40]} />
      <Stage data={data} />
    </Canvas>
  );
}
