'use client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges, Line } from '@react-three/drei';
import { CalloutLabel } from './CalloutLabel';
import { useThemeStore } from '@/ui/theme';

/**
 * FinFET 3D illustration — a labelled, rotatable three.js reproduction of the
 * reference structure (page 5): a grey silicon substrate, an orange gate-oxide
 * layer, a tall silicon fin running source→drain, and a blue gate wrapping the
 * fin, with the Gate/Source/Drain/Oxide callouts and the Fin Width, Fin Height
 * and Gate Length dimensions. Fixed geometry — a clean teaching figure.
 */

const C = {
  substrate: '#9aa3ad',
  fin: '#c2cad2',
  oxide: '#f0a53a',
  gate: '#3b7fd4',
  edge: '#1f2937',
};

// three.js: X = fin width, Y = up, Z = source→drain length
const SUB_HALF = 2.7;
const SUB_BOT = -1.1;
const OX_TOP = 0.14;
const FIN_HW = 0.3;
const FIN_LEN = 2.35; // half length
const FIN_TOP = 1.3;
const GATE_HW = 0.98;
const GATE_HL = 0.72; // half gate length along the fin
const GATE_TOP = 1.78;

function Box({
  x0, x1, y0, y1, z0, z1, color, opacity = 1, roughness = 0.6, metalness = 0.08,
}: {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  color: string; opacity?: number; roughness?: number; metalness?: number;
}) {
  return (
    <mesh position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}>
      <boxGeometry args={[x1 - x0, y1 - y0, z1 - z0]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={roughness} metalness={metalness} depthWrite={opacity >= 1} />
      <Edges threshold={15} color={C.edge} />
    </mesh>
  );
}

const chip = (text: string, bold = true) => (
  <span
    className={`select-none whitespace-nowrap rounded-md bg-black/70 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm ${
      bold ? 'font-bold' : ''
    }`}
  >
    {text}
  </span>
);

function Stage() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 9, 6]} intensity={2.6} />
      <pointLight position={[-6, 3, 5]} intensity={14} color="#dfe8ff" />

      {/* silicon substrate */}
      <Box x0={-SUB_HALF} x1={SUB_HALF} y0={SUB_BOT} y1={0} z0={-SUB_HALF} z1={SUB_HALF} color={C.substrate} roughness={0.85} />
      {/* orange gate-oxide layer */}
      <Box x0={-SUB_HALF} x1={SUB_HALF} y0={0} y1={OX_TOP} z0={-SUB_HALF} z1={SUB_HALF} color={C.oxide} roughness={0.5} />
      {/* silicon fin */}
      <Box x0={-FIN_HW} x1={FIN_HW} y0={OX_TOP} y1={FIN_TOP} z0={-FIN_LEN} z1={FIN_LEN} color={C.fin} roughness={0.6} />
      {/* blue gate wrapping the fin */}
      <Box x0={-GATE_HW} x1={GATE_HW} y0={OX_TOP} y1={GATE_TOP} z0={-GATE_HL} z1={GATE_HL} color={C.gate} roughness={0.35} metalness={0.25} />

      {/* dimension brackets */}
      {/* Fin Width — across the fin top at the +Z end */}
      <Line points={[[-FIN_HW, FIN_TOP + 0.3, FIN_LEN], [FIN_HW, FIN_TOP + 0.3, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[-FIN_HW, FIN_TOP, FIN_LEN], [-FIN_HW, FIN_TOP + 0.3, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[FIN_HW, FIN_TOP, FIN_LEN], [FIN_HW, FIN_TOP + 0.3, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      {/* Fin Height — up the fin +X/+Z corner */}
      <Line points={[[FIN_HW + 0.35, OX_TOP, FIN_LEN], [FIN_HW + 0.35, FIN_TOP, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[FIN_HW, OX_TOP, FIN_LEN], [FIN_HW + 0.35, OX_TOP, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[FIN_HW, FIN_TOP, FIN_LEN], [FIN_HW + 0.35, FIN_TOP, FIN_LEN]]} color={C.edge} lineWidth={1.3} />
      {/* Gate Length — along the fin under the gate */}
      <Line points={[[GATE_HW, GATE_TOP + 0.3, GATE_HL], [GATE_HW, GATE_TOP + 0.3, -GATE_HL]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[GATE_HW, GATE_TOP, GATE_HL], [GATE_HW, GATE_TOP + 0.3, GATE_HL]]} color={C.edge} lineWidth={1.3} />
      <Line points={[[GATE_HW, GATE_TOP, -GATE_HL], [GATE_HW, GATE_TOP + 0.3, -GATE_HL]]} color={C.edge} lineWidth={1.3} />

      {/* labels */}
      <CalloutLabel anchor={[-GATE_HW, GATE_TOP * 0.7, 0]} position={[-GATE_HW - 1.2, GATE_TOP + 0.4, 0]}>{chip('Gate')}</CalloutLabel>
      <CalloutLabel anchor={[0, FIN_TOP * 0.6, FIN_LEN]} position={[0, FIN_TOP * 0.6 + 0.3, FIN_LEN + 1.1]}>{chip('Source')}</CalloutLabel>
      <CalloutLabel anchor={[0, FIN_TOP * 0.6, -FIN_LEN]} position={[0, FIN_TOP * 0.6 + 0.3, -FIN_LEN - 1.1]}>{chip('Drain')}</CalloutLabel>
      <CalloutLabel anchor={[SUB_HALF, OX_TOP / 2, -SUB_HALF + 0.6]} position={[SUB_HALF + 1.0, OX_TOP + 0.3, -SUB_HALF + 0.6]}>{chip('Oxide')}</CalloutLabel>
      <CalloutLabel anchor={[SUB_HALF, SUB_BOT / 2, SUB_HALF - 0.6]} position={[SUB_HALF + 1.2, SUB_BOT / 2, SUB_HALF - 0.6]}>{chip('Silicon Substrate')}</CalloutLabel>
      <CalloutLabel anchor={[0, FIN_TOP + 0.3, FIN_LEN]} position={[0, FIN_TOP + 0.75, FIN_LEN + 0.4]} leader={false}>{chip('Fin Width', false)}</CalloutLabel>
      <CalloutLabel anchor={[FIN_HW + 0.35, (OX_TOP + FIN_TOP) / 2, FIN_LEN]} position={[FIN_HW + 1.4, (OX_TOP + FIN_TOP) / 2, FIN_LEN]} leader={false}>{chip('Fin Height', false)}</CalloutLabel>
      <CalloutLabel anchor={[GATE_HW, GATE_TOP + 0.3, 0]} position={[GATE_HW + 1.3, GATE_TOP + 0.55, 0]} leader={false}>{chip('Gate Length', false)}</CalloutLabel>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={18}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 + 0.1}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export function FinfetScene3D() {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  return (
    <Canvas camera={{ position: [6.5, 4.2, 7.6], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      <Stage />
    </Canvas>
  );
}
