'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { DeviceGeometry } from './geometry';
import type { TransistorVisual } from './scene.types';
import { ChannelField } from './ChannelField';
import { damp } from './anim';
import { color } from './palette';

/**
 * A MOSFET drawn to the CMOS reference legend: a WELL/SUBSTRATE body (blue for
 * PMOS, tan for NMOS) with two green diffusion regions (light-green P+ for PMOS,
 * dark-green N+ for NMOS), a gray GATE OXIDE slab on the surface, a pink POLY
 * GATE on top, and gold CONTACTS. A glowing inversion channel forms in the body
 * under the oxide, bridging source→drain. Dimensions track W/L/Tox; the channel
 * tracks the engine's region/current. Each structure is a distinct material so
 * the geometry teaches without labels.
 */
const BODY_H = 0.62;

export function ParametricTransistor({
  position,
  gateOnTop,
  geometry,
  visual,
  heat,
  reducedMotion,
}: {
  position: [number, number, number];
  gateOnTop: boolean;
  geometry: DeviceGeometry;
  visual: TransistorVisual;
  heat: number;
  reducedMotion: boolean;
}) {
  const diffL = useRef<Mesh>(null);
  const diffR = useRef<Mesh>(null);
  const contactL = useRef<Mesh>(null);
  const contactR = useRef<Mesh>(null);
  const oxide = useRef<Mesh>(null);
  const gate = useRef<Group>(null);
  const channel = useRef<Mesh>(null);
  const body = useRef<Mesh>(null);
  const chanMat = useRef<MeshStandardMaterial>(null);

  const isP = visual.type === 'pmos';
  const diffusion = useMemo(() => color(isP ? 'pplus' : 'nplus'), [isP]);
  const bodyColor = useMemo(() => color(isP ? 'well' : 'substrate'), [isP]);
  const carrier = visual.tint;
  const gold = color('contact');
  const gray = color('oxide');
  const pink = color('poly');

  // Animated current dimensions — ALL dims ease together toward the target so
  // the device grows/shrinks smoothly and symmetrically (no snap-vs-lerp jitter).
  const cur = useRef({ span: 1.6, gateLen: 0.7, padX: 0.5, depth: 1.1, tox: 0.1 });

  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 7;
    const c = cur.current;
    c.span = damp(c.span, 1.25 + geometry.channelLength * 1.0, k, dt);
    c.gateLen = damp(c.gateLen, 0.5 + geometry.channelLength * 0.55, k, dt);
    c.padX = damp(c.padX, 0.42 + geometry.channelLength * 0.08, k, dt);
    c.depth = damp(c.depth, geometry.bodyWidth * 1.05, k, dt);
    c.tox = damp(c.tox, Math.max(0.05, geometry.oxideGap), k, dt);

    const sx = c.span / 2 - c.padX / 2;
    const channelLen = Math.max(0.12, c.span - 2 * c.padX);

    if (body.current) body.current.scale.set(c.span, BODY_H, c.depth);

    if (diffL.current) {
      diffL.current.scale.set(c.padX, 0.24, c.depth * 0.92);
      diffL.current.position.x = -sx;
    }
    if (diffR.current) {
      diffR.current.scale.set(c.padX, 0.24, c.depth * 0.92);
      diffR.current.position.x = sx;
    }
    if (contactL.current) contactL.current.position.x = -sx;
    if (contactR.current) contactR.current.position.x = sx;

    if (channel.current) channel.current.scale.set(channelLen, 0.11, c.depth * 0.82);

    if (oxide.current) {
      oxide.current.scale.set(c.gateLen, c.tox + 0.02, c.depth * 0.85);
      oxide.current.position.y = 0.1 + (c.tox + 0.02) / 2;
    }
    if (gate.current) {
      gate.current.scale.set(c.gateLen * 0.62, 1, c.depth * 0.72);
      gate.current.position.y = 0.1 + c.tox + 0.13;
    }

    if (chanMat.current) {
      chanMat.current.opacity = damp(chanMat.current.opacity, 0.06 + visual.channelDensity * 0.92, reducedMotion ? 1e3 : 6, dt);
      chanMat.current.emissiveIntensity = damp(chanMat.current.emissiveIntensity, 0.3 + visual.channelDensity * 1.4 + visual.activity * 1.8, 6, dt);
    }
  });

  return (
    <group position={position}>
      {/* Body: WELL (blue, PMOS) / SUBSTRATE (tan, NMOS) */}
      <mesh ref={body} position={[0, -BODY_H / 2, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={bodyColor} roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Inversion channel — inside the body, under the oxide, S→D (focal) */}
      <mesh ref={channel} position={[0, 0.0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={chanMat} color={carrier} emissive={carrier} emissiveIntensity={0.6} transparent opacity={0.2} depthWrite={false} />
      </mesh>

      {/* Source / Drain diffusion regions (green) */}
      <mesh ref={diffL} position={[-1, -0.01, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.06 + visual.activity * 0.25} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh ref={diffR} position={[1, -0.01, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.06 + visual.activity * 0.25} roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Gold contacts on the diffusions */}
      <mesh ref={contactL} position={[-1, 0.17, 0]}>
        <boxGeometry args={[0.16, 0.1, 0.4]} />
        <meshStandardMaterial color={gold} metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh ref={contactR} position={[1, 0.17, 0]}>
        <boxGeometry args={[0.16, 0.1, 0.4]} />
        <meshStandardMaterial color={gold} metalness={0.85} roughness={0.3} />
      </mesh>

      {/* Gate oxide — gray slab on the surface */}
      <mesh ref={oxide} position={[0, 0.13, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={gray} roughness={0.5} metalness={0.1} />
      </mesh>

      {/* Poly gate — pink bar on the oxide + gold contact */}
      <group ref={gate} position={[0, 0.32, 0]}>
        <mesh>
          <boxGeometry args={[1, 0.2, 1]} />
          <meshStandardMaterial color={pink} roughness={0.45} metalness={0.05} emissive={pink} emissiveIntensity={0.05} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[0.4, 0.08, 0.4]} />
          <meshStandardMaterial color={gold} metalness={0.85} roughness={0.28} />
        </mesh>
      </group>

      {/* Carriers in the channel */}
      <ChannelField visual={visual} geometry={geometry} heat={heat} reducedMotion={reducedMotion} />

      <Html center distanceFactor={9} position={[0, gateOnTop ? 0.95 : -0.95, 0]}>
        <span className="flex select-none items-center gap-1.5 whitespace-nowrap rounded-md bg-black/55 px-2 py-0.5 text-[10px] backdrop-blur-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: diffusion }} />
          <span className="eyebrow text-[9px] text-white">{visual.type}</span>
          <span style={{ color: visual.regionAccent }}>{visual.region}</span>
        </span>
      </Html>
    </group>
  );
}
