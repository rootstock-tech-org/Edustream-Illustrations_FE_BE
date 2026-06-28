/**
 * Device-material palette, matched to the reference textbook CMOS-inverter
 * diagram (the photo): the structure reads through a warm/cool N/P convention —
 *   N-type → ORANGE (n⁺ S/D), P-type → GREEN (p⁺ S/D), gates/channels → RED,
 *   all metal (contacts + Input/Output/supply wires) → BLUE, the n-well a warm
 *   SALMON and the p-substrate a pale GRAY. Power/current ride the cyan accent.
 *   Every block also carries a thin structural EDGE (see `edge`) so the geometry
 *   reads crisply, just like the outlined slabs in the diagram.
 */
export const PALETTE: Record<string, string> = {
  surface: '#0e1116',
  ink: '#f5f7fa',
  'ink-muted': '#8b97a8',
  accent: '#35c8ff', // electric blue — handles / selection / rim glow
  current: '#2fa8d8', // cyan — drain–source CURRENT pulses
  edge: '#3a4250', // thin structural outline on every block

  // Photo convention: N-type = orange, P-type = green
  substrate: '#dad9d3', // p-type substrate — pale gray (recessive base)
  nwell: '#e6a88e', // n-well — warm salmon (PMOS body)
  nplus: '#e6963c', // n⁺ diffusion — orange (NMOS S/D)
  pplus: '#5ea95b', // p⁺ diffusion — green (PMOS S/D)
  poly: '#d23b2d', // polysilicon gate / channel — red
  oxide: '#86d7e6', // gate oxide — pale cyan (thin, mostly tucked under the gate)
  metal: '#2f7cd4', // metal interconnect (Input / Output wires) — blue
  contact: '#2f7cd4', // contact pillars — blue (same as the wires in the photo)

  vdd: '#3f86db', // VDD (1 V) terminal — blue
  gnd: '#2a6cc0', // GND (0 V) terminal — blue (deeper, to read apart from VDD)

  // Carriers (channel glow): electrons cool cyan, holes green
  electron: '#7df9ff',
  hole: '#9be08a',

  // legacy aliases
  steel: '#2f7cd4',
  nmos: '#e6963c',
  pmos: '#5ea95b',
  gate: '#d23b2d',
  'gate-cap': '#2f7cd4',
  heat: '#ffffff',
};

export const color = (token: string): string => PALETTE[token] ?? PALETTE.accent!;
