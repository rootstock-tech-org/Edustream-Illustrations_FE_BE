'use client';
import { terminalX } from './ParametricTransistor';
import { CalloutLabel } from './CalloutLabel';
import type { DeviceGeometry } from './geometry';
import { color } from './palette';

/**
 * Always-on region callouts that NAME the inverter's silicon, exactly as the
 * reference textbook cross-section labels it:
 *   pMOS (left, in the n-well): p⁺ SOURCE (outer → VDD) + p⁺ DRAIN (inner → OUT)
 *   nMOS (right, in the substrate): n⁺ DRAIN (inner → OUT) + n⁺ SOURCE (outer → GND)
 *   plus the N-WELL (pMOS body) and the foundational P-SUBSTRATE.
 * Source/drain SIDES are derived from sign(x) so the labels track the device
 * placement (photo: pMOS-left / nMOS-right) — never hard-coded left/right.
 */
const chip = (text: string, dot: string) => (
  <span className="flex select-none items-center gap-1.5 whitespace-nowrap rounded-md bg-black/65 px-2 py-0.5 text-[10px] ring-1 ring-white/10 backdrop-blur-sm">
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
    <span className="eyebrow text-[9px] text-white">{text}</span>
  </span>
);

export function RegionLabels({
  geometry,
  nmosX,
  pmosX,
  deviceY,
  wellX,
}: {
  geometry: DeviceGeometry;
  nmosX: number;
  pmosX: number;
  deviceY: number;
  wellX: number;
}) {
  const tx = terminalX(geometry);
  const fz = geometry.bodyWidth / 2 + 0.04; // front face of the diffusions (leader anchor)
  const pCol = color('pplus'); // green — p⁺ S/D
  const nCol = color('nplus'); // orange — n⁺ S/D
  const wellCol = color('nwell'); // salmon — n-well
  const subCol = '#cfcfc8'; // pale gray — p-substrate

  const pOuter = Math.sign(pmosX) || -1; // pMOS outer direction (toward VDD)
  const nOuter = Math.sign(nmosX) || 1; // nMOS outer direction (toward GND)

  const pSrcX = pmosX + pOuter * tx; // p⁺ source — outer
  const pDrnX = pmosX - pOuter * tx; // p⁺ drain — inner
  const nDrnX = nmosX - nOuter * tx; // n⁺ drain — inner
  const nSrcX = nmosX + nOuter * tx; // n⁺ source — outer

  const y = deviceY - 0.05; // diffusion-surface anchor height

  return (
    <group>
      {/* pMOS p⁺ diffusions (left) */}
      <CalloutLabel anchor={[pSrcX, y, fz]} position={[pSrcX - 0.2, deviceY - 1.25, 0]}>{chip('p⁺ source', pCol)}</CalloutLabel>
      <CalloutLabel anchor={[pDrnX, y, fz]} position={[pDrnX + 0.15, deviceY - 1.85, 0]}>{chip('p⁺ drain', pCol)}</CalloutLabel>

      {/* nMOS n⁺ diffusions (right) */}
      <CalloutLabel anchor={[nDrnX, y, fz]} position={[nDrnX - 0.15, deviceY - 1.85, 0]}>{chip('n⁺ drain', nCol)}</CalloutLabel>
      <CalloutLabel anchor={[nSrcX, y, fz]} position={[nSrcX + 0.2, deviceY - 1.25, 0]}>{chip('n⁺ source', nCol)}</CalloutLabel>

      {/* Bodies: n-well (under pMOS) + p-substrate (whole base) */}
      <CalloutLabel anchor={[wellX, deviceY - 0.25, fz]} position={[pmosX, deviceY - 2.45, 0]}>{chip('N-well', wellCol)}</CalloutLabel>
      <CalloutLabel anchor={[nmosX + nOuter * 0.3, deviceY - 0.5, fz]} position={[nmosX, deviceY - 2.45, 0]}>{chip('P-substrate', subCol)}</CalloutLabel>
    </group>
  );
}
