/**
 * Device-material palette matching the CMOS layout/cross-section reference:
 *   p-substrate = yellow, n-well = blue, n⁺ diffusion = green, p⁺ diffusion =
 *   pink, polysilicon gate = gray, gate oxide = thin yellow, metal = silver,
 *   contacts = dark. These make the academically-correct structure self-evident.
 *   The red accent is reserved for the live current (not a static region).
 */
export const PALETTE: Record<string, string> = {
  surface: '#09100c',
  ink: '#fcfbf9',
  'ink-muted': '#96a898',
  accent: '#7ae582', // brand mint — handles / selection / rim glow
  current: '#16bac5', // brand teal — drain–source CURRENT (distinct from green n⁺)

  // Reference legend
  substrate: '#ecd98f', // p-type substrate — yellow
  nwell: '#8a8fce', // n-well — blue/periwinkle (PMOS body)
  nplus: '#5cb85c', // n⁺ diffusion — green (NMOS S/D)
  pplus: '#e57a92', // p⁺ diffusion — pink (PMOS S/D)
  poly: '#9a9ca3', // polysilicon gate — gray
  oxide: '#e0c24a', // gate oxide — thin yellow
  metal: '#b9bdc6', // metal interconnect — silver
  contact: '#2c2c33', // contact — dark

  vdd: '#e23b3b', // VDD rail accent — red
  gnd: '#1c1c20', // GND rail — near-black

  // Carriers (channel glow)
  electron: '#bfe6ff',
  hole: '#ffcf9e',

  // legacy aliases
  steel: '#b9bdc6',
  nmos: '#5cb85c',
  pmos: '#e57a92',
  gate: '#9a9ca3',
  'gate-cap': '#2c2c33',
  heat: '#ffffff',
};

export const color = (token: string): string => PALETTE[token] ?? PALETTE.accent!;
