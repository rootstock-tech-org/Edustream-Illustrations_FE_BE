/**
 * Device-material palette, harmonised with the RootStock app palette while
 * keeping the academic structure legible via a clean N/P convention:
 *   N-type → blue/cyan (n-well, n⁺), P-type → green (p-substrate, p⁺),
 *   polysilicon = slate, oxide = pale cyan, metal = cool silver, contacts =
 *   navy graphite. Power/current ride the electric-blue accent. Every block also
 *   carries a thin structural EDGE (see `edge`) so the geometry reads crisply.
 */
export const PALETTE: Record<string, string> = {
  surface: '#0e1116',
  ink: '#f5f7fa',
  'ink-muted': '#8b97a8',
  accent: '#35c8ff', // electric blue — handles / selection / rim glow
  current: '#2fa8d8', // cyan — drain–source CURRENT
  edge: '#39465a', // thin structural outline on every block

  // N-type = blue/cyan, P-type = green
  substrate: '#7e8c63', // p-type substrate — sage green
  nwell: '#3f5e8c', // n-well — tech blue (PMOS body)
  nplus: '#2fa8d8', // n⁺ diffusion — cyan (NMOS S/D)
  pplus: '#6fae5a', // p⁺ diffusion — green (PMOS S/D)
  poly: '#7c8696', // polysilicon gate — slate
  oxide: '#86d7e6', // gate oxide — pale cyan
  metal: '#aeb6c2', // metal interconnect — cool silver
  contact: '#1d2430', // contact — navy graphite

  vdd: '#35c8ff', // VDD rail accent — electric blue (power)
  gnd: '#222a36', // GND rail — graphite

  // Carriers (channel glow): electrons cool cyan, holes green
  electron: '#7df9ff',
  hole: '#9be08a',

  // legacy aliases
  steel: '#aeb6c2',
  nmos: '#2fa8d8',
  pmos: '#6fae5a',
  gate: '#7c8696',
  'gate-cap': '#1d2430',
  heat: '#ffffff',
};

export const color = (token: string): string => PALETTE[token] ?? PALETTE.accent!;
