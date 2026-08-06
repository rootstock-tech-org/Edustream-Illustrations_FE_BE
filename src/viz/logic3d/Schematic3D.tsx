'use client';
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { GateKind } from '@/ui/components/logic/GateSymbols';
import { gateShape, xorBackCurve, isInverting, noseX, hasBackArc, BUBBLE_R } from './gateShape';
import { useThemeStore } from '@/ui/theme';

/**
 * A declarative 3D logic-schematic renderer. Diagrams are described in the SAME
 * SVG coordinate space as the 2D versions (x right, y down, `width`×`height`
 * viewBox); this maps them onto a 3D board: gate symbols become extruded solid
 * bodies, wires become tubes, and pin names become billboarded labels. One
 * renderer backs the gate gallery, the flip-flops and the MUX/DEMUX diagrams.
 */

export interface Gate3DSpec {
  kind: GateKind;
  gx: number; // svg top-left of the 60×40 unit box
  gy: number;
  high?: boolean | undefined;
  scale?: number | undefined; // shrink/grow a single gate (default 1)
}
export interface Wire3DSpec {
  points: ReadonlyArray<readonly [number, number]>;
  high?: boolean | undefined;
}
export interface Label3DSpec {
  x: number;
  y: number;
  text: string;
  bold?: boolean;
}

const HI = '#22c55e';
const LO = '#8b97a8';
const DEPTH = 8; // extrude depth in svg units

function chip(text: string, bold?: boolean) {
  return (
    <span
      className={`select-none whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 text-[8px] text-white ring-1 ring-white/10 backdrop-blur-sm ${
        bold ? 'font-bold' : ''
      }`}
    >
      {text}
    </span>
  );
}

function Gate3D({ spec, S }: { spec: Gate3DSpec; S: number }) {
  const color = spec.high ? HI : '#c3cad4';
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(gateShape(spec.kind), {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 1.2,
      bevelSize: 1.0,
      bevelSegments: 2,
      curveSegments: 24,
    });
    g.translate(0, 0, -DEPTH / 2);
    return g;
  }, [spec.kind]);
  const backGeo = useMemo(() => {
    if (!hasBackArc(spec.kind)) return null;
    return new THREE.TubeGeometry(xorBackCurve(), 24, 1.6, 8, false);
  }, [spec.kind]);

  const nx = noseX(spec.kind);
  const gs = spec.scale ?? 1;
  return (
    <group scale={[S * gs, S * gs, S * gs]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {backGeo && (
        <mesh geometry={backGeo}>
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.15} />
        </mesh>
      )}
      {isInverting(spec.kind) && (
        <mesh position={[nx + BUBBLE_R, 0, 0]}>
          <sphereGeometry args={[BUBBLE_R, 20, 20]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
        </mesh>
      )}
    </group>
  );
}

function Wire3D({ points, high, S }: { points: ReadonlyArray<readonly [number, number]>; high?: boolean | undefined; S: number }) {
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    // Crisp schematic routing: a tube that follows each straight segment
    // exactly (sharp right-angle corners), not a smoothed spline.
    const pts = points.map(([x, y]) => new THREE.Vector3(x, y, DEPTH / 2 + 1));
    const path = new THREE.CurvePath<THREE.Vector3>();
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      path.add(new THREE.LineCurve3(pts[i]!, pts[i + 1]!));
      total += pts[i]!.distanceTo(pts[i + 1]!);
    }
    const tubular = Math.max(pts.length * 2, Math.round(total / 4));
    return new THREE.TubeGeometry(path, tubular, 1.5, 8, false);
  }, [points]);
  const joints = useMemo(() => points.slice(1, -1), [points]);
  if (!geo) return null;
  const mat = <meshStandardMaterial color={high ? HI : LO} emissive={high ? HI : '#000000'} emissiveIntensity={high ? 0.35 : 0} roughness={0.5} metalness={0.1} />;
  return (
    <group scale={[S, S, S]}>
      <mesh geometry={geo}>{mat}</mesh>
      {joints.map(([x, y], i) => (
        <mesh key={i} position={[x, y, DEPTH / 2 + 1]}>
          <sphereGeometry args={[1.6, 8, 8]} />
          {mat}
        </mesh>
      ))}
    </group>
  );
}

function Scene({
  width,
  height,
  gates,
  wires,
  labels,
  S,
}: {
  width: number;
  height: number;
  gates: readonly Gate3DSpec[];
  wires: readonly Wire3DSpec[];
  labels: readonly Label3DSpec[];
  S: number;
}) {
  // svg (x,y) → world; board centred at origin
  const wx = (x: number) => (x - width / 2) * S;
  const wy = (y: number) => (height / 2 - y) * S;

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 8, 9]} intensity={2.4} />
      <pointLight position={[-6, 3, 6]} intensity={10} color="#dfe8ff" />

      {/* board */}
      <mesh position={[0, 0, -DEPTH / 2 * S - 0.05]}>
        <boxGeometry args={[width * S + 0.6, height * S + 0.6, 0.12]} />
        <meshStandardMaterial color="#161b22" roughness={0.9} metalness={0.1} />
      </mesh>

      {wires.map((w, i) => (
        <group key={`w${i}`} position={[-width / 2 * S, height / 2 * S, 0]}>
          {/* wires authored in svg coords: shift origin so (0,0)→ top-left, y flipped by negative scale */}
          <group scale={[1, -1, 1]}>
            <Wire3D points={w.points} high={w.high} S={S} />
          </group>
        </group>
      ))}

      {gates.map((g, i) => {
        const gs = g.scale ?? 1;
        return (
          <group key={`g${i}`} position={[wx(g.gx + 30 * gs), wy(g.gy + 20 * gs), 0]}>
            <Gate3D spec={g} S={S} />
          </group>
        );
      })}

      {labels.map((l, i) => (
        <Html key={`l${i}`} center position={[wx(l.x), wy(l.y), DEPTH / 2 * S + 0.1]} distanceFactor={10} zIndexRange={[20, 0]}>
          {chip(l.text, l.bold)}
        </Html>
      ))}

      <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={4} maxDistance={22} minPolarAngle={0.15} maxPolarAngle={Math.PI / 2 + 0.15} />
    </>
  );
}

export function Schematic3D({
  width,
  height,
  gates,
  wires,
  labels = [],
  spanWorld = 10,
  className,
}: {
  width: number;
  height: number;
  gates: readonly Gate3DSpec[];
  wires: readonly Wire3DSpec[];
  labels?: readonly Label3DSpec[];
  spanWorld?: number;
  className?: string;
}) {
  const S = spanWorld / Math.max(width, height);
  const light = useThemeStore((s) => s.theme === 'light');
  const bg = light ? '#eef1f5' : '#0e1116';
  const camZ = spanWorld * 1.05;
  return (
    <div className={className}>
      <Canvas frameloop="demand" camera={{ position: [spanWorld * 0.28, spanWorld * 0.42, camZ], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <Scene width={width} height={height} gates={gates} wires={wires} labels={labels} S={S} />
      </Canvas>
    </div>
  );
}
