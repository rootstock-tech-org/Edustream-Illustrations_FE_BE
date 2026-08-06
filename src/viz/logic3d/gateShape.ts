import * as THREE from 'three';
import type { GateKind } from '@/ui/components/logic/GateSymbols';

/**
 * 3D counterparts of the 2D ANSI gate symbols: each gate outline is authored as
 * a centred THREE.Shape (unit box x∈[-30,30], y∈[-20,20], y-up) that the
 * Schematic3D renderer extrudes into a solid body. Coordinates line up 1:1 with
 * the 2D `GateSymbols` unit box (60×40) so wires authored in the same SVG space
 * connect to the same points once mapped into 3D.
 */

const INVERTING: Record<GateKind, boolean> = {
  buffer: false, not: true, and: false, nand: true, or: false, nor: true, xor: false, xnor: true,
};

export const BUBBLE_R = 4;

export function gateShape(kind: GateKind): THREE.Shape {
  const s = new THREE.Shape();
  switch (kind) {
    case 'buffer':
    case 'not':
      s.moveTo(-26, 18);
      s.lineTo(-26, -18);
      s.lineTo(18, 0);
      s.closePath();
      return s;
    case 'and':
    case 'nand':
      s.moveTo(-26, 18);
      s.lineTo(0, 18);
      s.absarc(0, 0, 18, Math.PI / 2, -Math.PI / 2, true);
      s.lineTo(-26, -18);
      s.closePath();
      return s;
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor':
      s.moveTo(-26, 18);
      s.quadraticCurveTo(0, 16, 24, 0);
      s.quadraticCurveTo(0, -16, -26, -18);
      s.quadraticCurveTo(-10, 0, -26, 18);
      s.closePath();
      return s;
  }
}

/** The extra concave back arc for XOR/XNOR, as a thin open curve. */
export function xorBackCurve(): THREE.Curve<THREE.Vector3> {
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-33, 18, 0),
    new THREE.Vector3(-23, 0, 0),
    new THREE.Vector3(-33, -18, 0),
  ]);
  return c;
}

export function isInverting(kind: GateKind): boolean {
  return INVERTING[kind];
}

/** Output nose X (unit space, centred) per gate family, before the bubble. */
export function noseX(kind: GateKind): number {
  if (kind === 'or' || kind === 'nor' || kind === 'xor' || kind === 'xnor') return 24;
  return 18;
}

export function hasBackArc(kind: GateKind): boolean {
  return kind === 'xor' || kind === 'xnor';
}
