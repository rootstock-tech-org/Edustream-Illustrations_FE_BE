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

/**
 * The generic MOSFET stage — a standalone tab, independent from the
 * NMOS/PMOS/CMOS-Inverter scenes (no shared component is modified here). It
 * draws the textbook single-device anatomy and labels it exactly like the
 * classic cross-section diagram: Source, Gate, Drain, n+ diffusions, the
 * Channel region, Gate oxide and the P-Type Bulk.
 */
export interface MosfetSceneData {
  readonly geometry: DeviceGeometry;
  readonly visual: TransistorVisual;
  readonly lLabel: string;
  readonly wLabel: string;
  readonly reducedMotion: boolean;
}

const DEVICE_FOV = 40;

function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const cam = useThree((s) => s.camera) as PerspectiveCamera;
  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 4;
    if (Math.abs(cam.fov - DEVICE_FOV) > 0.05) {
      cam.fov = damp(cam.fov, DEVICE_FOV, k, dt);
      cam.updateProjectionMatrix();
    }
  });
  return null;
}

const BULK_H = 1.6;
const BULK_COL = '#dad9d3'; // P-Type bulk — pale gray (matches the app's substrate token)

const chip = (text: string) => (
  <span className="eyebrow select-none whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[9px] text-white ring-1 ring-white/10 backdrop-blur-sm">
    {text}
  </span>
);

function Stage({ data }: { data: MosfetSceneData }) {
  const tx = terminalX(data.geometry);
  const gl = gateLength(data.geometry);
  const depth = data.geometry.bodyWidth;
  const oxH = Math.max(0.05, data.geometry.oxideGap * 0.6);
  const edge = color('edge');
  const nplus = color('nplus');
  const oxide = color('oxide');
  const poly = color('poly');
  const contact = color('contact');
  const carrier = data.visual.tint;

  const gateTopY = 0.03 + oxH + 0.3;

  return (
    <>
      <CameraRig reducedMotion={data.reducedMotion} />
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

      {/* n+ source / drain diffusions, sunk into the bulk surface */}
      <mesh position={[-tx, -0.19, 0]}>
        <boxGeometry args={[0.9, 0.42, depth]} />
        <meshStandardMaterial color={nplus} emissive={nplus} emissiveIntensity={0.2 + data.visual.activity * 0.3} roughness={0.5} metalness={0.05} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[tx, -0.19, 0]}>
        <boxGeometry args={[0.9, 0.42, depth]} />
        <meshStandardMaterial color={nplus} emissive={nplus} emissiveIntensity={0.2 + data.visual.activity * 0.3} roughness={0.5} metalness={0.05} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* inversion channel between the diffusions */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[gl + 0.6, 0.06, depth * 0.9]} />
        <meshStandardMaterial color={carrier} emissive={carrier} emissiveIntensity={0.4 + data.visual.channelDensity * 1.2} transparent opacity={0.15 + data.visual.channelDensity * 0.7} depthWrite={false} />
      </mesh>

      {/* gate oxide */}
      <mesh position={[0, 0.03 + oxH / 2, 0]}>
        <boxGeometry args={[gl + 0.15, oxH, depth * 0.82]} />
        <meshStandardMaterial color={oxide} roughness={0.5} metalness={0.1} emissive={oxide} emissiveIntensity={0.12} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* polysilicon gate + its metal contact */}
      <group>
        <mesh position={[0, gateTopY - 0.15, 0]}>
          <boxGeometry args={[gl + 0.05, 0.3, depth * 0.72]} />
          <meshStandardMaterial color={poly} metalness={0.5} roughness={0.45} />
          <Edges threshold={15} color={edge} />
        </mesh>
        <mesh position={[0, gateTopY + 0.06, 0]}>
          <boxGeometry args={[0.34, 0.18, 0.42]} />
          <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
          <Edges threshold={15} color={edge} />
        </mesh>
      </group>

      {/* source / drain metal contacts */}
      <mesh position={[-tx, 0.42, 0]}>
        <boxGeometry args={[0.32, 0.9, 0.5]} />
        <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh position={[tx, 0.42, 0]}>
        <boxGeometry args={[0.32, 0.9, 0.5]} />
        <meshStandardMaterial color={contact} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* labels — named exactly like the reference cross-section diagram */}
      <CalloutLabel anchor={[0, gateTopY + 0.15, 0.2]} position={[0, 2.1, 0.3]}>{chip('Gate')}</CalloutLabel>
      <CalloutLabel anchor={[-tx, 0.87, 0.25]} position={[-tx - 0.5, 1.7, 0.5]}>{chip('Source')}</CalloutLabel>
      <CalloutLabel anchor={[tx, 0.87, 0.25]} position={[tx + 0.5, 1.7, 0.5]}>{chip('Drain')}</CalloutLabel>
      <CalloutLabel anchor={[-tx, -0.1, depth / 2 - 0.1]} position={[-tx, -0.85, depth / 2 + 0.3]}>{chip('n+')}</CalloutLabel>
      <CalloutLabel anchor={[tx, -0.1, depth / 2 - 0.1]} position={[tx, -0.85, depth / 2 + 0.3]}>{chip('n+')}</CalloutLabel>
      <CalloutLabel anchor={[0, -0.03, depth / 2 - 0.1]} position={[0, -0.95, depth / 2 + 0.4]}>{chip('Channel region')}</CalloutLabel>
      <CalloutLabel anchor={[gl / 2 + 0.1, 0.05, 0]} position={[gl / 2 + 1.1, 0.6, -0.6]}>{chip('Gate oxide')}</CalloutLabel>
      <CalloutLabel anchor={[0, -BULK_H + 0.2, 0]} position={[0, -BULK_H - 0.9, 0]}>{chip('Bulk')}</CalloutLabel>
      <CalloutLabel anchor={[0, -BULK_H / 2, -(depth + 0.6) / 2 + 0.1]} position={[0, -BULK_H / 2, -(depth + 0.6) / 2 - 0.4]} leader={false}>{chip('P-Type')}</CalloutLabel>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        minDistance={4}
        maxDistance={16}
        minPolarAngle={0.3}
        maxPolarAngle={Math.PI / 2 + 0.15}
        target={[0, 0.2, 0]}
      />
    </>
  );
}

export function MosfetScene({ data }: { data: MosfetSceneData }) {
  return (
    <Canvas camera={{ position: [4.2, 3.4, 7.4], fov: DEVICE_FOV }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[color('surface')]} />
      <Stage data={data} />
    </Canvas>
  );
}
