/**
 * Device-material palette matching the CMOS cross-section reference legend:
 *   POLY GATE pink · GATE OXIDE gray · P+ DIFFUSION light-green ·
 *   N+ DIFFUSION dark-green · METAL purple · CONTACT gold · WELL blue ·
 *   SUBSTRATE tan. These textbook colours make each structure self-evident.
 *   The red accent stays for the VDD rail / energized current only.
 */
export const PALETTE: Record<string, string> = {
  surface: '#000000',
  ink: '#ffffff',
  'ink-muted': '#a1a6b0',
  accent: '#df2531',

  // Reference legend
  well: '#9fb8d4', // WELL — light steel blue (PMOS body)
  substrate: '#d6c7a0', // SUBSTRATE — tan/beige (NMOS body / p-substrate)
  pplus: '#a8d65e', // P+ DIFFUSION — light yellow-green (PMOS S/D)
  nplus: '#2f8f4f', // N+ DIFFUSION — dark green (NMOS S/D)
  oxide: '#abacb2', // GATE OXIDE — gray
  poly: '#ef8aa0', // POLY GATE — pink
  contact: '#e2a83a', // CONTACT — gold
  metal: '#6a40b8', // METAL — purple (VIN / VOUT / interconnect)
  vdd: '#e23b3b', // VDD rail — red
  gnd: '#1c1c20', // GND rail — near-black

  // Carriers (channel glow) — cool electrons / warm holes
  electron: '#bfe6ff',
  hole: '#ffcf9e',

  // legacy aliases
  steel: '#cdd2da',
  nmos: '#2f8f4f',
  pmos: '#a8d65e',
  gate: '#ef8aa0',
  'gate-cap': '#e2a83a',
  nwell: '#9fb8d4',
  heat: '#ffffff',
};

export const color = (token: string): string => PALETTE[token] ?? PALETTE.accent!;
