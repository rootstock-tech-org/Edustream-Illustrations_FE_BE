'use client';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { color } from './palette';
import type { DeviceGeometry } from './geometry';
import type { TransistorVisual } from './scene.types';
import { CalloutLabel } from './CalloutLabel';
import { terminalX, gateLength } from './ParametricTransistor';
import { damp } from './anim';
import { useLabModes, crossSectionActive } from './lab-modes';
import { AnatomyOverlay } from './AnatomyOverlay';
import { useThemeStore } from '@/ui/theme';

/**
 * The FinFET stage — a standalone tab, independent from the NMOS/PMOS/
 * CMOS-Inverter/MOSFET scenes (no shared component is modified here). Unlike
 * the planar MOSFET's single flat body, TWO thin parallel silicon fins stand
 * up side by side (with a visible gap between them) and ONE gate slab crosses
 * over both, wrapping their exposed faces — the tell-tale "3-D" look of a
 * FinFET diagram versus a planar cross-section. Source/Drain are wide merged
 * pads capping both fins' ends, same as how real fins merge into shared
 * epitaxial diffusions.
 */
export interface FinfetSceneData {
  readonly geometry: DeviceGeometry;
  readonly visual: TransistorVisual;
  readonly lLabel: string;
  readonly wLabel: string;
  readonly reducedMotion: boolean;
}

const DEVICE_FOV = 40;

function CameraRig({ cross, reducedMotion }: { cross: boolean; reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    if (cross) {
      cam.position.x = damp(cam.position.x, 0, k, dt);
      cam.position.y = damp(cam.position.y, 0.5, k, dt);
      cam.position.z = damp(cam.position.z, 8.5, k, dt);
      cam.fov = damp(cam.fov, 30, k, dt);
      cam.updateProjectionMatrix();
    } else if (Math.abs(cam.fov - DEVICE_FOV) > 0.05) {
      cam.fov = damp(cam.fov, DEVICE_FOV, k, dt);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

const BULK_H = 1.6;
const BULK_COL = '#dad9d3'; // P-Type bulk — pale gray (matches the app's substrate token)
const BOX_H = 0.14; // thin buried-oxide band under the fins, like the reference diagram's base
const FIN_H = 0.95; // fin rise above that band
const FIN_T = 0.22; // a single fin's thickness
const FIN_GAP = 0.36; // the visible gap between the two parallel fins
const FIN_SPAN = 2 * FIN_T + FIN_GAP; // full footprint of both fins together

const chip = (text: string) => (
  <span className="eyebrow select-none whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm">
    {text}
  </span>
);

function Stage({ data }: { data: FinfetSceneData }) {
  const tx = terminalX(data.geometry);
  const gl = gateLength(data.geometry);
  const depth = data.geometry.bodyWidth;
  const edge = color('edge');
  const nplus = color('nplus');
  const oxide = color('oxide');
  const poly = color('poly');
  const contact = color('contact');
  const carrier = data.visual.tint;
  const cross = useLabModes(crossSectionActive);
  // In teaching modes AnatomyOverlay supplies the clickable region labels
  // (and feeds the sidebar Learning card), so the plain names step aside.
  const anatomy = useLabModes((s) => s.anatomy);
  const learning = useLabModes((s) => s.learning);
  const teaching = anatomy || learning;

  const finY = BOX_H + FIN_H / 2; // fin center height, sitting on the thin base band
  const finLen = gl + 0.7; // fins run a bit past the gate on each side, so a sliver of bare fin shows
  const padH = FIN_H + 0.3; // raised, merged epitaxial source/drain — taller than the bare fins
  const padZ = FIN_SPAN + 0.4; // pads are wide enough to cap both fins + the gap between them
  const gateZ = FIN_SPAN + 0.5;
  const gateH = FIN_H + 0.55;
  // conformal coat on each fin, slightly longer than the gate so a thin
  // liner shows right at its edges — not a slab spanning both fins.
  const oxideLen = gl + 0.3;
  const oxideH = FIN_H + 0.05;
  const oxideT = FIN_T + 0.1;

  return (
    <>
      <CameraRig cross={cross} reducedMotion={data.reducedMotion} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 8, 7]} intensity={3.0} color="#ffffff" />
      <pointLight position={[-6, 2, 4]} intensity={18} color="#dfe8ff" />
      <pointLight position={[0, 0, 6]} intensity={3 + data.visual.activity * 12} color={color('accent')} distance={20} />

      {/* P-Type bulk */}
      <mesh position={[0, -BULK_H / 2, 0]}>
        <boxGeometry args={[tx * 2 + 2.2, BULK_H, depth + 0.6]} />
        <meshStandardMaterial color={BULK_COL} roughness={0.95} metalness={0.02} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* thin accent band under the fins — a stylized two-tone base matching
          the reference diagram, not a modeled BOX layer (most FinFETs are
          bulk, not SOI) */}
      <mesh position={[0, BOX_H / 2, 0]}>
        <boxGeometry args={[tx * 2 + 2.2, BOX_H, depth + 0.6]} />
        <meshStandardMaterial color={contact} roughness={0.6} metalness={0.2} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* the two parallel fins — same silicon as the bulk, thin and standing
          side by side with a visible gap: the "3-D" tell vs. the planar body */}
      <mesh position={[0, finY, -(FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[finLen, FIN_H, FIN_T]} />
        <meshStandardMaterial color={BULK_COL} roughness={0.9} metalness={0.03} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[0, finY, (FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[finLen, FIN_H, FIN_T]} />
        <meshStandardMaterial color={BULK_COL} roughness={0.9} metalness={0.03} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* raised n+ source / drain — wide pads merging both fins' ends */}
      <mesh position={[-tx, BOX_H + padH / 2, 0]}>
        <boxGeometry args={[0.9, padH, padZ]} />
        <meshStandardMaterial color={nplus} emissive={nplus} emissiveIntensity={0.2 + data.visual.activity * 0.3} roughness={0.5} metalness={0.05} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[tx, BOX_H + padH / 2, 0]}>
        <boxGeometry args={[0.9, padH, padZ]} />
        <meshStandardMaterial color={nplus} emissive={nplus} emissiveIntensity={0.2 + data.visual.activity * 0.3} roughness={0.5} metalness={0.05} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* inversion channel — forms at each fin's own surface under the gate,
          so the glow lives inside the fin bodies themselves, not in the
          empty gap between them (current never flows through open air) */}
      <mesh position={[0, finY, -(FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[gl + 0.02, FIN_H - 0.05, FIN_T - 0.03]} />
        <meshStandardMaterial color={carrier} emissive={carrier} emissiveIntensity={0.4 + data.visual.channelDensity * 1.2} transparent opacity={0.15 + data.visual.channelDensity * 0.7} depthWrite={false} />
      </mesh>
      <mesh position={[0, finY, (FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[gl + 0.02, FIN_H - 0.05, FIN_T - 0.03]} />
        <meshStandardMaterial color={carrier} emissive={carrier} emissiveIntensity={0.4 + data.visual.channelDensity * 1.2} transparent opacity={0.15 + data.visual.channelDensity * 0.7} depthWrite={false} />
      </mesh>

      {/* gate oxide — a thin coat conformal to each fin, peeking out just past
          the gate's covered length like a real oxide/spacer liner would */}
      <mesh position={[0, BOX_H + oxideH / 2, -(FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[oxideLen, oxideH, oxideT]} />
        <meshStandardMaterial color={oxide} roughness={0.5} metalness={0.1} emissive={oxide} emissiveIntensity={0.12} transparent opacity={0.75} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[0, BOX_H + oxideH / 2, (FIN_T + FIN_GAP) / 2]}>
        <boxGeometry args={[oxideLen, oxideH, oxideT]} />
        <meshStandardMaterial color={oxide} roughness={0.5} metalness={0.1} emissive={oxide} emissiveIntensity={0.12} transparent opacity={0.75} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* the gate — ONE slab crossing over both fins, wrapping their exposed faces */}
      <group>
        <mesh position={[0, BOX_H + gateH / 2, 0]}>
          <boxGeometry args={[gl + 0.05, gateH, gateZ]} />
          <meshStandardMaterial color={poly} metalness={0.5} roughness={0.45} />
          <Edges threshold={15} color={edge} />
        </mesh>
        <mesh position={[0, BOX_H + gateH + 0.09, 0]}>
          <boxGeometry args={[0.34, 0.18, 0.42]} />
          <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
          <Edges threshold={15} color={edge} />
        </mesh>
      </group>

      {/* source / drain metal contacts, on top of the raised pads */}
      <mesh position={[-tx, BOX_H + padH + 0.16, 0]}>
        <boxGeometry args={[0.32, 0.32, 0.5]} />
        <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[tx, BOX_H + padH + 0.16, 0]}>
        <boxGeometry args={[0.32, 0.32, 0.5]} />
        <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* labels — each anchored on its own real surface point and pulled out
          into its own clear compass lane (up / upper-left / upper-right /
          front-left / front-right / back-right / straight down) so leaders
          never cross or cluster and stay unambiguous in this tightly-layered
          geometry. Hidden in teaching modes, where AnatomyOverlay labels the
          regions instead. */}
      {!teaching && (
        <>
          <CalloutLabel anchor={[0, BOX_H + gateH, 0.3]} position={[0, BOX_H + gateH + 1.0, 0.5]}>{chip('Gate')}</CalloutLabel>
          <CalloutLabel anchor={[-tx, BOX_H + padH, 0.3]} position={[-tx - 1.0, BOX_H + padH + 0.6, 1.1]}>{chip('Source')}</CalloutLabel>
          <CalloutLabel anchor={[tx, BOX_H + padH, 0.3]} position={[tx + 1.0, BOX_H + padH + 0.6, 1.1]}>{chip('Drain')}</CalloutLabel>
          <CalloutLabel anchor={[gl / 2 + 0.3, finY, (FIN_T + FIN_GAP) / 2]} position={[gl / 2 + 1.3, finY + 1.1, 1.7]}>{chip('Fin')}</CalloutLabel>
          <CalloutLabel anchor={[0, finY, (FIN_T + FIN_GAP) / 2]} position={[-(gl / 2 + 1.1), finY + 1.0, 1.6]}>{chip('Channel region')}</CalloutLabel>
          <CalloutLabel anchor={[gl / 2 + 0.15, BOX_H + oxideH / 2, -(FIN_T + FIN_GAP) / 2]} position={[gl / 2 + 1.2, BOX_H + 0.5, -1.6]}>{chip('Gate oxide')}</CalloutLabel>
          <CalloutLabel anchor={[0, -BULK_H + 0.2, 0]} position={[0, -BULK_H - 0.6, 0]}>{chip('Bulk')}</CalloutLabel>
          <CalloutLabel anchor={[0, -BULK_H / 2, -(depth + 0.6) / 2 + 0.1]} position={[0, -BULK_H / 2, -(depth + 0.6) / 2 + 0.1]} leader={false}>{chip('P-Type')}</CalloutLabel>
        </>
      )}

      {/* Engineering anatomy callouts (source/drain/gate/oxide/channel/substrate)
          — clicking one in Learning mode feeds the sidebar Learning card. */}
      <AnatomyOverlay geometry={data.geometry} deviceX={0} deviceY={0} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableRotate={!cross}
        enableZoom={!cross}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        minDistance={4}
        maxDistance={16}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 + 0.15}
        target={[0, 0.35, 0]}
      />
    </>
  );
}

export function FinfetScene({ data }: { data: FinfetSceneData }) {
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  return (
    <Canvas camera={{ position: [4.4, 3.2, 7.6], fov: DEVICE_FOV }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 11, 22]} />
      <Stage data={data} />
    </Canvas>
  );
}
