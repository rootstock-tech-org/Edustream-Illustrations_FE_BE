'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { DeviceGeometry } from './geometry';
import type { TransistorVisual } from './scene.types';
import { CalloutLabel } from './CalloutLabel';
import { damp } from './anim';
import { color } from './palette';

/**
 * Surface features of one MOSFET, BUILT INTO the shared silicon (the body block
 * — p-substrate or n-well — is owned by the scene, not this component). It draws
 * the two diffusion regions sunk into the silicon surface (n⁺ for NMOS, p⁺ for
 * PMOS), the channel between them, and the gate STACK over the channel:
 *   metal contact → polysilicon gate → gate oxide → channel.
 * Source/drain ROLE is assigned by the wiring (outer = source at its rail, inner
 * = drain at the shared output). Dimensions track W (depth) / L (gate length) /
 * Tox. The local origin sits on the silicon SURFACE (y = 0).
 */
const DIFF_W = 0.62; // wider diffusions — the transistor is the hero (hierarchy #1)
const DIFF_DEPTH = 0.62; // how deep the diffusion is implanted INSIDE the silicon
export const gateLength = (g: DeviceGeometry) => 0.52 + g.channelLength * 0.32;
/** X offset from device centre to a source/drain contact (for the wiring). */
export const terminalX = (g: DeviceGeometry) => gateLength(g) / 2 + DIFF_W / 2 + 0.08;
export const deviceHalfWidth = (g: DeviceGeometry) => terminalX(g) + DIFF_W / 2 + 0.1;

export function ParametricTransistor({
  position,
  geometry,
  visual,
  reducedMotion,
}: {
  position: [number, number, number];
  geometry: DeviceGeometry;
  visual: TransistorVisual;
  reducedMotion: boolean;
}) {
  const diffL = useRef<Mesh>(null);
  const diffR = useRef<Mesh>(null);
  const contactL = useRef<Mesh>(null);
  const contactR = useRef<Mesh>(null);
  const channel = useRef<Mesh>(null);
  const oxide = useRef<Mesh>(null);
  const gate = useRef<Group>(null);
  const chanMat = useRef<MeshStandardMaterial>(null);

  const isP = visual.type === 'pmos';
  const diffusion = useMemo(() => color(isP ? 'pplus' : 'nplus'), [isP]);
  const carrier = visual.tint;
  const poly = color('poly');
  const oxideCol = color('oxide');
  const contactCol = color('contact');
  const edge = color('edge');

  const cur = useRef({ gl: 0.7, depth: 1.0, tox: 0.06 });

  useFrame((_, dt) => {
    const k = reducedMotion ? 1e3 : 7;
    const c = cur.current;
    c.gl = damp(c.gl, gateLength(geometry), k, dt);
    c.depth = damp(c.depth, geometry.bodyWidth * 0.86, k, dt);
    c.tox = damp(c.tox, Math.max(0.04, geometry.oxideGap * 0.6), k, dt);
    const tx = c.gl / 2 + DIFF_W / 2 + 0.08;

    // Diffusions sit implanted INSIDE the silicon — tops recessed just below the
    // surface so the gray substrate rims above them (reads as embedded, not on top).
    if (diffL.current) { diffL.current.scale.set(DIFF_W, DIFF_DEPTH, c.depth); diffL.current.position.set(-tx, -DIFF_DEPTH / 2 - 0.04, 0); }
    if (diffR.current) { diffR.current.scale.set(DIFF_W, DIFF_DEPTH, c.depth); diffR.current.position.set(tx, -DIFF_DEPTH / 2 - 0.04, 0); }
    if (contactL.current) contactL.current.position.x = -tx;
    if (contactR.current) contactR.current.position.x = tx;
    if (channel.current) channel.current.scale.set(c.gl + DIFF_W * 0.5, 0.07, c.depth * 0.96);
    // gate oxide + poly extend a touch past the channel so they OVERLAP the inner
    // source/drain edges — the physical gate-to-S/D overlap region (a slight margin).
    if (oxide.current) { oxide.current.scale.set(c.gl + 0.34, c.tox, c.depth * 0.9); oxide.current.position.y = 0.02 + c.tox / 2; }
    if (gate.current) { gate.current.scale.set(c.gl + 0.26, 1, c.depth * 0.82); gate.current.position.y = 0.02 + c.tox + 0.15; }

    if (chanMat.current) {
      chanMat.current.opacity = damp(chanMat.current.opacity, 0.06 + visual.channelDensity * 0.9, reducedMotion ? 1e3 : 6, dt);
      chanMat.current.emissiveIntensity = damp(chanMat.current.emissiveIntensity, 0.3 + visual.channelDensity * 1.4 + visual.activity * 1.8, 6, dt);
    }
  });

  return (
    <group position={position}>
      {/* Diffusion regions implanted into the silicon surface — bright, so the
          transistor pops against the muted substrate (hierarchy #1). */}
      <mesh ref={diffL} position={[-1, -DIFF_DEPTH / 2 - 0.04, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.08 + visual.activity * 0.2} roughness={0.5} metalness={0.05} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh ref={diffR} position={[1, -DIFF_DEPTH / 2 - 0.04, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={diffusion} emissive={diffusion} emissiveIntensity={0.08 + visual.activity * 0.2} roughness={0.5} metalness={0.05} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* Inversion channel between the diffusions, under the gate */}
      <mesh ref={channel} position={[0, -0.015, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial ref={chanMat} color={carrier} emissive={carrier} emissiveIntensity={0.6} transparent opacity={0.2} depthWrite={false} />
      </mesh>

      {/* Metal contacts — tall enough to reach from the recessed diffusion up to
          the wire bus (top stays at y≈0.25 for the DeviceScene wiring). */}
      <mesh ref={contactL} position={[-1, 0.07, 0]}>
        <boxGeometry args={[0.22, 0.36, 0.45]} />
        <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>
      <mesh ref={contactR} position={[1, 0.07, 0]}>
        <boxGeometry args={[0.22, 0.36, 0.45]} />
        <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
        <Edges threshold={15} color={edge} />
      </mesh>

      {/* Gate stack: thin oxide → poly gate → metal contact, over the channel */}
      <mesh ref={oxide} position={[0, 0.05, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={oxideCol} roughness={0.5} metalness={0.1} emissive={oxideCol} emissiveIntensity={0.12} />
        <Edges threshold={15} color={edge} />
      </mesh>
      {/* Polysilicon gate — taller/iconic so the device reads as a transistor */}
      <group ref={gate} position={[0, 0.24, 0]}>
        <mesh>
          <boxGeometry args={[1, 0.26, 1]} />
          <meshStandardMaterial color={poly} metalness={0.5} roughness={0.45} />
          <Edges threshold={15} color={edge} />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[0.34, 0.14, 0.42]} />
          <meshStandardMaterial color={contactCol} metalness={0.4} roughness={0.5} />
          <Edges threshold={15} color={edge} />
        </mesh>
      </group>

      {/* Device label in the outer-top lane, leader to the gate — parked well
          clear of the geometry so it never overlaps the device. */}
      <CalloutLabel anchor={[0, 0.5, 0.2]} position={[isP ? 0.45 : -0.45, 1.45, 0]}>
        <span className="flex select-none items-center gap-1.5 whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[10px] ring-1 ring-white/10 backdrop-blur-sm">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: diffusion }} />
          <span className="eyebrow text-[9px] text-white">{isP ? 'pMOS' : 'nMOS'}</span>
          <span style={{ color: visual.regionAccent, textShadow: `0 0 8px ${visual.regionAccent}88` }}>{visual.region}</span>
        </span>
      </CalloutLabel>
    </group>
  );
}
