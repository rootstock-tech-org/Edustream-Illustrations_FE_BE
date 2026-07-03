/**
 * The full 180 nm CMOS fabrication flow from the "Design → Fab → Test →
 * Packaging" deck — every process slide as its own step (pattern → implant →
 * etch → strip → anneal, each interconnect deposit/pattern/etch/CMP, test,
 * packaging). Each step carries its module, a plain-language description, the
 * tool/method, and an illustration `stage` that drives the 3D model in
 * FabricationScene3D. Transient cues (photoresist masks, ion-implant arrows,
 * blanket deposits) are derived in the scene from the step title. Pure data.
 */

export type FabStage =
  | 'wafer'
  | 'padox'
  | 'nitride'
  | 'trench'
  | 'liner'
  | 'fill'
  | 'cmp'
  | 'sti'
  | 'pwell'
  | 'nwell'
  | 'gateox'
  | 'polydep'
  | 'gate'
  | 'reox'
  | 'sde'
  | 'spacer'
  | 'sd'
  | 'silicide'
  | 'bpsg'
  | 'contact'
  | 'metal1'
  | 'imd'
  | 'metal2'
  | 'passiv'
  | 'pad';

/** Illustration stages in BUILD order (a later stage includes all earlier ones). */
export const FAB_STAGES: readonly FabStage[] = [
  'wafer', 'padox', 'nitride', 'trench', 'liner', 'fill', 'cmp', 'sti',
  'pwell', 'nwell', 'gateox', 'polydep', 'gate', 'reox', 'sde', 'spacer',
  'sd', 'silicide', 'bpsg', 'contact', 'metal1', 'imd', 'metal2', 'passiv', 'pad',
];

export interface FabStep {
  readonly module: string;
  readonly title: string;
  readonly description: string;
  readonly method: string;
  readonly stage: FabStage;
}

const S = (module: string, title: string, method: string, stage: FabStage, description: string): FabStep => ({ module, title, method, stage, description });

export const FAB_STEPS: readonly FabStep[] = [
  // ── Introduction ──────────────────────────────────────────────────────────
  S('Introduction', '180 nm CMOS Process', 'Overview', 'wafer',
    'Core CMOS on a 200 mm (8-inch) fab at the 0.18 µm node. We sculpt one CMOS inverter — PMOS pull-up (left, n-well) beside NMOS pull-down (right, p-well) — step by step, exactly as a foundry builds it. Drag to rotate the 3D wafer.'),
  S('Introduction', 'Process Modules', 'Process flow', 'wafer',
    'Modules: Shallow-Trench Isolation → Retrograde Wells → Gate Oxide & Poly → LDD Extensions → Spacers → Source/Drain → Salicide → Contacts, Interconnects & Passivation → Test → Packaging.'),

  // ── Wafer Start ───────────────────────────────────────────────────────────
  S('Wafer Start', 'Silicon Wafer (8-inch)', 'Wafer start', 'wafer',
    'Start with a pure, defect-free single-crystal silicon 8-inch wafer — the canvas for every device.'),
  S('Wafer Start', 'Laser Marking', 'Laser marking', 'wafer',
    'Lot-ID and wafer numbers are laser-marked as wafers move from bank to lot box. All processing runs in a class-1 clean room.'),

  // ── Shallow Trench Isolation ──────────────────────────────────────────────
  S('Shallow Trench Isolation', 'Grow Pad Oxide', 'Furnace oxidation', 'padox',
    'A very thin SiO₂ is thermally grown — a stress-relief buffer between the silicon and the coming nitride.'),
  S('Shallow Trench Isolation', 'Deposit Silicon Nitride', 'LPCVD', 'nitride',
    'Si₃N₄ is CVD-deposited as the polish-stop / hard-mask for trench formation and CMP.'),
  S('Shallow Trench Isolation', 'Pattern Photoresist for Trenches', 'DUV litho', 'nitride',
    'The most critical STI litho: resist is spun, DUV-exposed and developed, opening the trench regions.'),
  S('Shallow Trench Isolation', 'Etch Nitride, Pad-Oxide & Trenches', 'Dry etch (RIE)', 'trench',
    'RIE etches the nitride/pad-oxide (fluorine), then etches trenches into the silicon (chlorine) — defining the two transistor active areas.'),
  S('Shallow Trench Isolation', 'Remove Photoresist (Ash)', 'O₂ plasma ash', 'trench',
    'An oxygen plasma burns off the resist layer.'),
  S('Shallow Trench Isolation', 'Grow Liner Oxide', 'Furnace oxidation', 'liner',
    'A thin trench-liner oxide is grown in an atmospheric furnace to smooth the trench walls.'),
  S('Shallow Trench Isolation', 'Fill Trenches (HDP Oxide)', 'HDP-CVD', 'fill',
    'A CVD (HDP) oxide conformally overfills the trenches. This dielectric prevents cross-talk between transistors.'),
  S('Shallow Trench Isolation', 'RAA Mask', 'DUV litho', 'fill',
    'Reverse-Active-Area mask defines where the bumped oxide is thinned before CMP.'),
  S('Shallow Trench Isolation', 'RAA Oxide Etch', 'Dry etch (RIE)', 'fill',
    'RIE (fluorine) etches back the HDP oxide over the active areas defined by the RAA mask.'),
  S('Shallow Trench Isolation', 'Remove Photoresist (Ash)', 'O₂/N₂ plasma ash', 'fill',
    'Plasma ashing removes the RAA resist.'),
  S('Shallow Trench Isolation', 'Oxide CMP (Planarize)', 'CMP', 'cmp',
    'Chemical-Mechanical Polishing removes the extra oxide and planarizes the surface, stopping on the nitride.'),
  S('Shallow Trench Isolation', 'Strip Nitride & Oxide → STI Done', 'Wet etch (H₃PO₄)', 'sti',
    'A hot phosphoric-acid wet etch removes the nitride, completing Shallow Trench Isolation. Active islands are ready.'),
  S('Shallow Trench Isolation', 'Grow Sacrificial Oxide', 'Furnace oxidation', 'sti',
    'A thin sacrificial oxide protects the bare active silicon from contamination during the implant steps.'),

  // ── Retrograde Wells ──────────────────────────────────────────────────────
  S('Retrograde Wells', 'Pattern Photoresist for P-Well', 'MUV litho', 'sti',
    'A thick-resist, non-critical mask covers the PMOS side and opens the NMOS (p-well) region.'),
  S('Retrograde Wells', 'Implant P-Well (Boron)', 'Ion implant (B⁺)', 'pwell',
    'A deep, high-energy boron implant creates the localized p-type well for the NMOS (right).'),
  S('Retrograde Wells', 'N-Channel Punch-Through Implant', 'Ion implant (B⁺)', 'pwell',
    'A boron implant reduces the NMOS susceptibility to source–drain punch-through.'),
  S('Retrograde Wells', 'N-Channel Vₜ Adjust Implant', 'Ion implant (B⁺)', 'pwell',
    'A shallow boron implant sets the NMOS threshold voltage.'),
  S('Retrograde Wells', 'Strip P-Well Photoresist', 'Piranha strip', 'pwell',
    'The p-well resist is stripped off in Piranha solution.'),
  S('Retrograde Wells', 'Pattern Photoresist for N-Well', 'MUV litho', 'pwell',
    'Resist now covers the NMOS side and opens the PMOS (n-well) region.'),
  S('Retrograde Wells', 'Implant N-Well (Phosphorus)', 'Ion implant (P⁺⁺)', 'nwell',
    'A deep phosphorus implant creates the localized n-type well the PMOS lives in (left).'),
  S('Retrograde Wells', 'P-Channel Punch-Through Implant', 'Ion implant (P⁺⁺)', 'nwell',
    'A phosphorus implant reduces the PMOS punch-through susceptibility.'),
  S('Retrograde Wells', 'VTP Implant (Vₜ Adjust)', 'Ion implant (P⁺⁺)', 'nwell',
    'A shallow phosphorus implant sets the PMOS threshold voltage.'),
  S('Retrograde Wells', 'Strip N-Well Photoresist', 'Piranha strip', 'nwell',
    'The n-well resist is stripped off in Piranha solution.'),
  S('Retrograde Wells', 'Anneal Well Implants (RTA)', 'Rapid Thermal Anneal', 'nwell',
    'RTA repairs implant damage and activates the dopants, driving them slightly deeper with minimal spread.'),

  // ── Gate Oxidation & Poly ─────────────────────────────────────────────────
  S('Gate Oxidation & Poly', 'Remove Sacrificial Oxide (HF)', 'Wet clean (HF)', 'nwell',
    'A wet HF dip strips the sacrificial oxide, leaving a pristine silicon surface for the gate dielectric.'),
  S('Gate Oxidation & Poly', 'Grow Gate Oxide', 'Furnace gate oxide', 'gateox',
    'The single most critical step: an ultra-thin, ultra-clean gate dielectric is grown to a precise thickness.'),
  S('Gate Oxidation & Poly', 'Deposit Polysilicon', 'LPCVD', 'polydep',
    'Polycrystalline silicon — the gate electrode material — is deposited as a blanket sheet over the whole wafer.'),
  S('Gate Oxidation & Poly', 'Pattern Photoresist for Gate', 'DUV litho', 'polydep',
    'The most critical patterning step: DUV with thin resist defines the poly gate length (sets switching speed).'),
  S('Gate Oxidation & Poly', 'Etch Poly & Strip Resist → Gate Stack', 'Dry etch (RIE)', 'gate',
    'Fluorine RIE etches the poly into the two gate stacks; the resist is stripped.'),
  S('Gate Oxidation & Poly', 'Oxidize Polysilicon (Re-ox)', 'Furnace oxidation', 'reox',
    'A thin oxide is grown on the poly as a buffer for the coming spacer/nitride layers.'),

  // ── S/D Extensions (LDD) ──────────────────────────────────────────────────
  S('S/D Extensions (LDD)', 'Pattern Photoresist for NMOS SDE', 'MUV litho', 'reox',
    'Resist masks the PMOS; the NMOS active is opened for the shallow extension implant.'),
  S('S/D Extensions (LDD)', 'NMOS SDE Implant (As)', 'Ion implant (As)', 'sde',
    'A very shallow, low-energy arsenic implant forms the NMOS source/drain tips — reducing hot-electron & short-channel effects.'),
  S('S/D Extensions (LDD)', 'NMOS Halo / Pocket Implant (BF₂)', 'Ion implant (BF₂)', 'sde',
    'An angled BF₂ pocket implant around the extension suppresses punch-through in the short channel.'),
  S('S/D Extensions (LDD)', 'Ash & Strip Photoresist', 'Ash + Piranha', 'sde',
    'Plasma ash + Piranha strip remove the NMOS SDE resist.'),
  S('S/D Extensions (LDD)', 'Pattern Photoresist for PMOS SDE', 'MUV litho', 'sde',
    'Resist masks the NMOS; the PMOS active is opened for its extension implant.'),
  S('S/D Extensions (LDD)', 'PMOS SDE Implant (BF₂)', 'Ion implant (BF₂)', 'sde',
    'A shallow BF₂ implant forms the PMOS source/drain tips.'),
  S('S/D Extensions (LDD)', 'Ash, Strip & Anneal (RTA)', 'Ash + Piranha + RTA', 'sde',
    'Resist is removed and an RTA heals the surface and activates the extension implants.'),

  // ── Spacer Formation ──────────────────────────────────────────────────────
  S('Spacer Formation', 'Deposit Oxide + Nitride', 'CVD (TEOS + Si₃N₄)', 'sde',
    'A conformal TEOS-oxide + silicon-nitride stack is CVD-deposited over the gates — thinner on horizontal surfaces, thicker on sidewalls.'),
  S('Spacer Formation', 'Etch Spacer Sidewalls', 'Dry etch (RIE)', 'spacer',
    'Anisotropic RIE clears the horizontal film but leaves sidewall spacers — which precisely offset the deep S/D implants.'),

  // ── Source/Drain ──────────────────────────────────────────────────────────
  S('Source/Drain', 'Pattern Photoresist for NMOS S/D', 'MUV litho', 'spacer',
    'Resist masks the PMOS; the NMOS active is opened for the heavy source/drain implant.'),
  S('Source/Drain', 'NMOS S/D Implant (As)', 'Ion implant (As)', 'sd',
    'A shallow, high-dose arsenic implant completes the heavily-doped n⁺ NMOS source and drain. The spacer shadows the implant near the gate.'),
  S('Source/Drain', 'Ash & Strip Photoresist', 'Ash + Piranha', 'sd',
    'Plasma ash + Piranha strip remove the NMOS S/D resist.'),
  S('Source/Drain', 'Pattern Photoresist for PMOS S/D', 'MUV litho', 'sd',
    'Resist masks the NMOS; the PMOS active is opened for its source/drain implant.'),
  S('Source/Drain', 'PMOS S/D Implant (Boron)', 'Ion implant (B)', 'sd',
    'A shallow, high-dose boron implant completes the p⁺ PMOS source and drain, self-aligned by the spacer.'),
  S('Source/Drain', 'Strip & Anneal Implants (RTA)', 'Ash + Piranha + RTA', 'sd',
    'RTA activates the dopants with virtually no migration. The transistors are now electrically formed.'),

  // ── Salicide ──────────────────────────────────────────────────────────────
  S('Salicide', 'Strip Surface Oxide (HF)', 'Wet dip (HF)', 'sd',
    'A quick HF dip exposes bare silicon on the source, drain and gate — ready to react with metal.'),
  S('Salicide', 'Deposit Cobalt + Titanium', 'Sputter', 'sd',
    'A sputter tool lays a thin cobalt film across the whole wafer, capped with titanium.'),
  S('Salicide', 'RTA → Cobalt Silicide', 'Rapid Thermal Anneal', 'silicide',
    'RTA makes cobalt react with silicon only where they touch, forming self-aligned silicide (Salicide) on S/D and gate.'),
  S('Salicide', 'Strip Unreacted Metal + CoSi₂ RTA', 'Wet etch + RTA', 'silicide',
    'A wet strip removes the unreacted cobalt/TiN; a high-temp RTA forms stable CoSi₂ — a low-resistance ohmic contact.'),

  // ── 1st Interconnect ──────────────────────────────────────────────────────
  S('1st Interconnect', 'Deposit BPSG + TEOS Oxide', 'CVD', 'bpsg',
    'Boro-phospho-silicate glass + TEOS oxide are deposited to insulate the devices from the first metal.'),
  S('1st Interconnect', 'Polish BPSG (CMP)', 'CMP', 'bpsg',
    'CMP planarizes the BPSG so later lithography and metal step-coverage stay in focus.'),
  S('1st Interconnect', 'Pattern Photoresist for Contacts', 'DUV litho', 'bpsg',
    'DUV defines the contact openings — where metal will reach the silicided S/D and gate.'),
  S('1st Interconnect', 'Contact Etch', 'Dry etch (RIE)', 'contact',
    'A carefully designed fluorine RIE etches vertical-sidewall contact holes down to the devices.'),
  S('1st Interconnect', 'Ti/TiN Barrier Deposition', 'MOCVD / sputter', 'contact',
    'A Ti/TiN barrier is deposited to help the tungsten adhere to the oxide.'),
  S('1st Interconnect', 'Tungsten Deposition (CVD)', 'Tungsten CVD', 'contact',
    'Tungsten deposits conformally by CVD and fills the contact holes.'),
  S('1st Interconnect', 'Polish Tungsten → Plugs (W CMP)', 'W CMP', 'contact',
    'CMP removes surface tungsten; the tungsten left in the holes forms the contact "plugs".'),
  S('1st Interconnect', 'Deposit Metal-1 (Sputter)', 'Sputter', 'metal1',
    'A TiN/Ti/AlCu/TiN metal sandwich is sputtered as a blanket layer.'),
  S('1st Interconnect', 'Pattern Photoresist for Metal-1', 'DUV litho', 'metal1',
    'DUV defines the first wiring layer.'),
  S('1st Interconnect', 'Etch Metal-1', 'Dry etch (RIE)', 'metal1',
    'A chlorine RIE etches the metal stack into Metal-1 interconnect lines.'),
  S('1st Interconnect', 'Strip Photoresist → Metal-1 Done', 'Ash + solvent', 'metal1',
    'Resist is stripped; the first interconnect layer is complete.'),

  // ── Upper Interconnects ───────────────────────────────────────────────────
  S('Upper Interconnects', 'Deposit IMD1 (HDP + TEOS)', 'HDP-CVD + CVD', 'imd',
    'An inter-metal dielectric (USG + TEOS) is deposited to insulate the metal layers from one another.'),
  S('Upper Interconnects', 'Polish IMD1 (CMP)', 'CMP', 'imd',
    'CMP planarizes the IMD for the next lithography and metal steps.'),
  S('Upper Interconnects', 'Pattern Photoresist for Vias', 'DUV litho', 'imd',
    'DUV defines the via openings that connect Metal-1 to Metal-2.'),
  S('Upper Interconnects', 'Via Etch', 'Dry etch (RIE)', 'imd',
    'A fluorine RIE etches vertical-sidewall via holes through the IMD.'),
  S('Upper Interconnects', 'Ash & Strip', 'Ash + solvent', 'imd',
    'Plasma ash + solvent strip remove the via resist.'),
  S('Upper Interconnects', 'Ti/TiN + Tungsten Via Fill', 'MOCVD Ti + CVD W', 'imd',
    'A Ti/TiN barrier + CVD tungsten fill the vias — same as the first interconnect.'),
  S('Upper Interconnects', 'Polish Tungsten (W CMP)', 'W CMP', 'imd',
    'W CMP leaves flush tungsten vias.'),
  S('Upper Interconnects', 'Deposit Metal-2 (Sputter)', 'Sputter', 'metal2',
    'Metal-2 is sputtered — similar to Metal-1 but thicker/wider (longer runs, more current).'),
  S('Upper Interconnects', 'Pattern Photoresist for Metal-2', 'DUV litho', 'metal2',
    'DUV defines Metal-2; adjacent layers run perpendicular to cut inductive coupling.'),
  S('Upper Interconnects', 'Etch Metal-2', 'Dry etch (RIE)', 'metal2',
    'A chlorine RIE etches the Metal-2 interconnect lines.'),
  S('Upper Interconnects', 'Strip Photoresist → Metal-2 Done', 'Ash + solvent', 'metal2',
    'Resist is stripped; the second interconnect layer is complete.'),
  S('Upper Interconnects', 'Repeat up to Metal-5 / Metal-6', 'IMD + Via + Metal (repeat)', 'metal2',
    'The IMD → via → metal cycle repeats up to five or six metal levels for real circuits.'),

  // ── Passivation ───────────────────────────────────────────────────────────
  S('Passivation', 'Deposit Passivation Layer', 'HDP-CVD / PECVD', 'passiv',
    'A silicon-nitride / oxynitride passivation seals the finished circuit against scratches, contamination and moisture.'),
  S('Passivation', 'Pattern & Open Bond Pads', 'DUV + Dry etch', 'pad',
    'A dry etch opens windows in the passivation over the top-metal bond pads for outside electrical access.'),

  // ── Test ──────────────────────────────────────────────────────────────────
  S('Test', 'Wafer Test / Sort (ATE)', 'Wafer probe (ATE)', 'pad',
    'Automatic 8-inch probers + ATE test every die, map the Known-Good-Dies, and feed results back to the fab.'),
  S('Test', 'Environmental & Radiation Test', 'Characterization', 'pad',
    'Device characterization: temperature/environmental chambers and radiation testing (TID + SEE) before datasheet release.'),

  // ── Packaging ─────────────────────────────────────────────────────────────
  S('Packaging', 'Wafer Dicing', 'Mechanical dicing', 'pad',
    'The tested wafer is diced into individual chips with a twin-blade dicing saw.'),
  S('Packaging', 'Die Attach & Wire Bond', 'Die attach + wedge bond', 'pad',
    'Each good die is attached to a package substrate and wire-bonded (Al wedge bonds) to the leads.'),
  S('Packaging', 'Hermetic Seal, Mark & Inspect', 'Seal + laser mark', 'pad',
    'The package is hermetically sealed, laser-marked, and inspected (bond-pull, die-shear, microscope).'),
  S('Packaging', 'Packaged Device', 'Final product', 'pad',
    'The result: a packaged, tested CMOS device — a single chip, ready for a board (or a multi-chip module).'),
];
