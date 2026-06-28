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
 *
 * The labels are STUCK TO THE SURFACE: each chip sits on the device's front face
 * (z = front), directly over its own region with only a short stem — so a student
 * reads the name right where the silicon is, never tracing a long leader to a row
 * of tags far below. S/D names ride just above their diffusions; the body names
 * sit on the well / substrate face. Sides come from sign(x) so they track the
 * device placement (photo: pMOS-left / nMOS-right) — never hard-coded.
 */
const chip = (text: string, dot: string) => (
  <span className="flex select-none items-center gap-1 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[9px] ring-1 ring-white/20 backdrop-blur-sm">
    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
    <span className="eyebrow text-[8px] tracking-wider text-white">{text}</span>
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
  const fz = geometry.bodyWidth / 2 + 0.06; // front face of the device (where chips stick)
  const pCol = color('pplus'); // green — p⁺ S/D
  const nCol = color('nplus'); // orange — n⁺ S/D
  const wellCol = color('nwell'); // salmon — n-well
  const subCol = '#b9b9b1'; // gray — p-substrate

  const pOuter = Math.sign(pmosX) || -1; // pMOS outer direction (toward VDD)
  const nOuter = Math.sign(nmosX) || 1; // nMOS outer direction (toward GND)

  const pSrcX = pmosX + pOuter * tx; // p⁺ source — outer
  const pDrnX = pmosX - pOuter * tx; // p⁺ drain — inner
  const nDrnX = nmosX - nOuter * tx; // n⁺ drain — inner
  const nSrcX = nmosX + nOuter * tx; // n⁺ source — outer

  const contactY = deviceY + 0.16; // diffusion-contact height (stem anchor)
  // S/D chips ride just above the surface; SOURCE (outer) sits higher so it clears
  // the taller VDD/GND voltage chips at the rails, DRAIN (inner) stays low in the
  // open space toward the output — so the two chips of one transistor never collide.
  const srcY = deviceY + 1.28;
  const drnY = deviceY + 0.52;

  return (
    <group>
      {/* pMOS p⁺ diffusions — stuck just above each diffusion on the front face */}
      <CalloutLabel anchor={[pSrcX, contactY, fz]} position={[pSrcX - 0.05, srcY, fz]}>{chip('p⁺ source', pCol)}</CalloutLabel>
      <CalloutLabel anchor={[pDrnX, contactY, fz]} position={[pDrnX + 0.05, drnY, fz]}>{chip('p⁺ drain', pCol)}</CalloutLabel>

      {/* nMOS n⁺ diffusions */}
      <CalloutLabel anchor={[nDrnX, contactY, fz]} position={[nDrnX - 0.05, drnY, fz]}>{chip('n⁺ drain', nCol)}</CalloutLabel>
      <CalloutLabel anchor={[nSrcX, contactY, fz]} position={[nSrcX + 0.05, srcY, fz]}>{chip('n⁺ source', nCol)}</CalloutLabel>

      {/* Bodies: tags planted directly ON the well / substrate front face (no stem) */}
      <CalloutLabel anchor={[wellX, deviceY - 0.22, fz]} position={[wellX, deviceY - 0.22, fz]} leader={false}>{chip('N-well', wellCol)}</CalloutLabel>
      <CalloutLabel anchor={[nmosX, deviceY - 0.42, fz]} position={[nmosX, deviceY - 0.42, fz]} leader={false}>{chip('P-substrate', subCol)}</CalloutLabel>
    </group>
  );
}
