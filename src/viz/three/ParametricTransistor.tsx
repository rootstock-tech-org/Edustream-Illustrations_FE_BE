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
 * A lateral MOSFET cross-section as in the reference: a body (yellow p-substrate
 * for NMOS / blue n-well for PMOS), two diffusion regions left & right (green n⁺
 * / pink p⁺), a gray polysilicon GATE on top over a thin oxide, and a channel
 * beneath the gate. Source/drain ROLE is assigned by the wiring (outer terminal
 * = source at its rail, inner terminal = drain at the shared Output), never by
 * left/right. Dimensions track W (depth) / L (channel length) / Tox.
 */
const BODY_H = 0.45;
const DIFF_W = 0.5;
export const gateLength = (g: DeviceGeometry) => 0.4 + g.channelLength * 0.3;
export const deviceHalfWidth = (g: DeviceGeometry) => (2 * DIFF_W + gateLength(g) + 0.3) / 2;
/** X distance from device centre to a source/drain contact (for the wiring). */
export const terminalX = (g: DeviceGeometry) => deviceHalfWidth(g) - DIFF_W / 2;

export function ParametricTransistor({
  position,
  geometry,
  visual,
  heat,
  reducedMotion,
}: {
  position: [number, number, number];
  geometry: DeviceGeometry;
  visual: TransistorVisual;
  heat: number;
  reducedMotion: boolean;
}) {
  const body = useRef<Mesh>(null);
  const diffL = useRef<Mesh>(null);
  const diffR = useRef<Mesh>(null);
  const contactL = useRef<Mesh>(null);
  const contactR = useRef<Mesh>(null);
  const oxide = useRef<Mesh>(null);
  const gate = useRef<Group>(null);
  const channel = useRef<Mesh>(null);
  const chanMat = useRef<MeshStandardMaterial>(null);

  const isP = visual.type === 'pmos';
  const diffusion = useMemo(() => color(isP ? 'pplus' : 'nplus'), [isP]);
  const bodyColor = useMemo(() => color(isP ? 'nwell' : 'substrate'), [isP]);
  const carrier = visual.tint;
  const poly = color('poly');
  const oxideCol = color('oxide');
  const contactCol = color('contact');

  const cur = useRef({ gl: 0.7, depth: 1.0, tox: 0.08, bw: 1.6 });

  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 7;
    const c = cur.current;
    c.gl = damp(c.gl, gateLength(geometry), k, dt);
    c.depth = damp(c.depth, geometry.bodyWidth, k, dt);
    c.tox = damp(c.tox, Math.max(0.04, geometry.oxideGap * 0.7), k, dt);
    c.bw = damp(c.bw, 2 * DIFF_W + c.gl + 0.3, k, dt);
    const sx = c.bw / 2 - DIFF_W / 2;

    if (body.current) body.current.scale.set(c.bw, BODY_H, c.depth);
    if (diffL.current) { diffL.current.scale.set(DIFF_W, 0.22, c.depth * 0.92); diffL.current.position.x = -sx; }
    if (diffR.current) { diffR.current.scale.set(DIFF_W, 0.22, c.depth * 0.92); diffR.current.position.x = sx; }
    if (contactL.current) contactL.current.position.x = -sx;
    if (contactR.current) contactR.current.position.x = sx;
    if (channel.current) channel.current.scale.set(c.gl + DIFF_W, 0.07, c.depth * 0.82);
    if (oxide.current) { oxide.current.scale.set(c.gl + 0.1, c.tox, c.depth * 0.85); oxide.current.position.y = 0.1 + c.tox / 2; }
    if (gate.current) { gate.current.scale.set(c.gl + 0.06, 1, c.depth * 0.82); gate.current.position.y = 0.1 + c.tox + 0.09; }

    if (chanMat.current) {
      chanMat.current.opacity = damp(chanMat.current.opacity, 0.06 + visual.channelDensity * 0.92, reducedMotion ? 1e3 : 6, dt);
      chanMat.current.emissiveIntensity = damp(chanMat.current.emissiveIntensity, 0.3 + visual.channelDensity * 1.4 + visual.activity * 1.8, 6, dt);
    }
  });

  return (
    <group position={position}>
      <mesh ref={body} position={[0, -BODY_H / 2, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={bodyColor} roughness={0.85} metalness={0.04} />
      </mesh>

      {/* Inversion channel under the gate, bridging the diffusions */}
      <mesh ref={channel} position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={chanMat} color={carrier} emissive={carrier} emissiveIntensity={0.6} transparent opacity={0.2} depthWrite={false} />
      </mesh>

      {/* Source / drain diffusions */}
      <mesh ref={diffL} position={[-1, -0.01, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.05 + visual.activity * 0.2} roughness={0.6} metalness={0.05} />
      </mesh>
      <mesh ref={diffR} position={[1, -0.01, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.05 + visual.activity * 0.2} roughness={0.6} metalness={0.05} />
      </mesh>

      {/* Metal contacts on the diffusions */}
      <mesh ref={contactL} position={[-1, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.12, 0.45]} />
        <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh ref={contactR} position={[1, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.12, 0.45]} />
        <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Thin gate oxide */}
      <mesh ref={oxide} position={[0, 0.12, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={oxideCol} roughness={0.5} metalness={0.1} emissive={oxideCol} emissiveIntensity={0.1} />
      </mesh>

      {/* Polysilicon gate (gray) on top */}
      <group ref={gate} position={[0, 0.3, 0]}>
        <mesh>
          <boxGeometry args={[1, 0.16, 1]} />
          <meshStandardMaterial color={poly} metalness={0.45} roughness={0.5} />
        </mesh>
      </group>

      <ChannelField visual={visual} geometry={geometry} heat={heat} reducedMotion={reducedMotion} />

      <Html center distanceFactor={9} position={[0, 0.85, 0]}>
        <span className="flex select-none items-center gap-1.5 whitespace-nowrap rounded-md bg-black/55 px-2 py-0.5 text-[10px] backdrop-blur-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: diffusion }} />
          <span className="eyebrow text-[9px] text-white">{isP ? 'pMOS' : 'nMOS'}</span>
          <span style={{ color: visual.regionAccent }}>{visual.region}</span>
        </span>
      </Html>
    </group>
  );
}
