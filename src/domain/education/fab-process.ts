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
    'Welcome to the 180 nm CMOS Fabrication simulation. CMOS (Complementary Metal-Oxide-Semiconductor) is the foundational technology of all modern computing, pairing PMOS and NMOS transistors to achieve near-zero static power consumption. In this simulation, you will step through the exact real-world manufacturing sequence used by commercial foundries to sculpt a silicon wafer into microscopic functional circuits. Drag the 3D model to explore.'),
  S('Introduction', 'Process Modules', 'Process flow', 'wafer',
    'Semiconductor manufacturing is broken down into distinct "Modules" or phases. We will progress through: Shallow-Trench Isolation (to separate devices), Retrograde Wells (to define electrical regions), Gate Formation (the switch mechanism), LDD & Spacers (managing electric fields), Source/Drain Implants (the current carriers), Salicide (lowering resistance), and finally the multi-layer Copper/Aluminum Interconnects that wire the billions of transistors together.'),

  // ── Wafer Start ───────────────────────────────────────────────────────────
  S('Wafer Start', 'Bare Silicon Wafer', 'Czochralski Process', 'wafer',
    'The process begins with a 200 mm (8-inch) monocrystalline silicon wafer. Grown using the Czochralski method from molten silicon, this wafer is polished to atomic-level flatness. It serves as the pure, defect-free canvas upon which we will physically build billions of microscopic transistors.'),

  // ── Shallow Trench Isolation (STI) ────────────────────────────────────────
  S('Shallow Trench Isolation', 'Grow Pad Oxide', 'Thermal Oxidation', 'padox',
    'A high-temperature furnace oxidizes the silicon surface to grow a very thin (10-15 nm) layer of Silicon Dioxide (SiO₂). This layer acts as a mechanical stress-relief buffer between the underlying silicon crystal lattice and the rigid silicon nitride film that will be deposited next.'),
  S('Shallow Trench Isolation', 'Deposit Silicon Nitride', 'LPCVD (Chemical Vapor Deposition)', 'nitride',
    'Low-Pressure Chemical Vapor Deposition (LPCVD) applies a thick, dense layer of Silicon Nitride (Si₃N₄). This nitride layer is extremely hard and serves two purposes: it acts as a protective mask during the upcoming trench etch, and acts as a physical stopping layer during the later Chemical-Mechanical Polishing (CMP) step.'),
  S('Shallow Trench Isolation', 'Photoresist & Lithography', 'DUV Lithography', 'nitride',
    'A liquid light-sensitive polymer (Photoresist) is spin-coated onto the wafer. A Deep Ultraviolet (DUV) laser shines through a glass reticle (mask), exposing specific areas of the resist. The exposed areas become soluble and are washed away, transferring the geometric circuit pattern onto the wafer.'),
  S('Shallow Trench Isolation', 'Etch Trenches', 'Reactive Ion Etching (RIE)', 'trench',
    'A highly directional Reactive Ion Etch (RIE) uses fluorine-based plasma to carve through the nitride and pad oxide, followed by a chlorine-based plasma to dig 300-400 nm deep trenches directly into the silicon substrate. These trenches will physically and electrically isolate adjacent transistors from each other.'),
  S('Shallow Trench Isolation', 'Remove Photoresist (Ash)', 'O₂ Plasma Ashing', 'trench',
    'An oxygen plasma "ash" burns away the remaining photoresist polymer, converting it to volatile gases (CO₂ and H₂O) which are exhausted from the chamber, leaving only the hard nitride mask and the freshly carved trenches.'),
  S('Shallow Trench Isolation', 'Grow Liner Oxide', 'Thermal Oxidation', 'liner',
    'The wafer is placed back into an oxidation furnace. A thin liner of oxide grows on the exposed silicon inside the trenches. This heals the microscopic crystal damage caused by the aggressive plasma etch and smooths out the sharp corners of the trench.'),
  S('Shallow Trench Isolation', 'Fill Trenches (HDP Oxide)', 'HDP-CVD', 'fill',
    'High-Density Plasma Chemical Vapor Deposition (HDP-CVD) blasts the wafer with silicon dioxide molecules, overfilling the trenches entirely. This specific deposition technique includes a simultaneous sputtering effect that prevents voids or air gaps from forming inside narrow trenches.'),
  S('Shallow Trench Isolation', 'Oxide CMP (Planarize)', 'Chemical-Mechanical Polishing', 'cmp',
    'The wafer is pressed facedown against a rotating polishing pad coated with a chemical slurry containing microscopic abrasive silica particles. This physical grinding and chemical etching removes all excess trench oxide, stopping exactly when it hits the hard Silicon Nitride layer, leaving a perfectly flat surface.'),
  S('Shallow Trench Isolation', 'Strip Nitride & Pad Oxide', 'Wet Etch', 'sti',
    'A bath of hot phosphoric acid (H₃PO₄) selectively dissolves the silicon nitride, followed by a brief hydrofluoric acid (HF) dip to remove the pad oxide. The Shallow Trench Isolation (STI) is now complete, leaving isolated "islands" of bare silicon where the transistors will be built.'),
  S('Shallow Trench Isolation', 'Grow Sacrificial Oxide', 'Thermal Oxidation', 'sti',
    'A thin sacrificial oxide is grown over the bare silicon islands. This temporary layer protects the pristine silicon crystal structure from physical damage and metal contamination during the violent, high-energy ion implantation steps that follow.'),

  // ── Retrograde Wells ──────────────────────────────────────────────────────
  S('Retrograde Wells', 'Pattern P-Well (NMOS)', 'Lithography', 'sti',
    'Photoresist is applied and patterned to protect the PMOS regions while exposing the NMOS regions. Because implants fire straight down, the photoresist physically blocks the ions from entering the protected areas of the wafer.'),
  S('Retrograde Wells', 'Implant P-Well (Boron)', 'Ion Implantation', 'pwell',
    'A magnetic particle accelerator fires Boron ions (B⁺) at extreme velocities into the exposed silicon. Boron has one less electron than Silicon, creating "holes" and turning this region into a P-type semiconductor. This deep well forms the foundation of the NMOS transistor.'),
  S('Retrograde Wells', 'N-Channel Vₜ Adjust Implant', 'Ion Implantation', 'pwell',
    'A shallower, lower-energy Boron implant is performed specifically near the surface of the channel. This finely tunes the Threshold Voltage (Vₜ) — the exact electrical voltage required to turn the NMOS transistor ON.'),
  S('Retrograde Wells', 'Pattern N-Well (PMOS)', 'Lithography & Strip', 'pwell',
    'The P-well photoresist is stripped using a Piranha solution (H₂SO₄ + H₂O₂). A new layer of photoresist is applied and patterned, this time exposing the PMOS regions and protecting the newly formed NMOS regions.'),
  S('Retrograde Wells', 'Implant N-Well (Phosphorus)', 'Ion Implantation', 'nwell',
    'Phosphorus ions (P⁺⁺) are accelerated into the exposed PMOS regions. Phosphorus has one extra electron compared to Silicon, providing free electrons and turning the region into an N-type semiconductor well. This is where the PMOS transistor will live.'),
  S('Retrograde Wells', 'P-Channel Vₜ Adjust Implant', 'Ion Implantation', 'nwell',
    'Similar to the NMOS, a shallow Phosphorus implant is performed at the surface to precisely tune the Threshold Voltage of the PMOS transistor.'),
  S('Retrograde Wells', 'Anneal Implants (RTA)', 'Rapid Thermal Annealing', 'nwell',
    'After stripping the photoresist, the wafer undergoes Rapid Thermal Annealing (RTA) — flashing it to over 1000°C for just a few seconds using high-intensity halogen lamps. This repairs the shattered silicon crystal lattice and electrically activates the implanted dopant atoms.'),

  // ── Gate Oxidation & Poly ─────────────────────────────────────────────────
  S('Gate Oxidation & Poly', 'Strip Sacrificial Oxide', 'Wet Etch (HF)', 'nwell',
    'A highly controlled Hydrofluoric Acid (HF) wet dip strips away the damaged sacrificial oxide, exposing an atomically clean, pristine silicon surface ready for the most critical layer in the entire transistor.'),
  S('Gate Oxidation & Poly', 'Grow Gate Oxide', 'Thermal Oxidation', 'gateox',
    'The Gate Oxide is the heart of the transistor. The wafer is baked in ultra-pure oxygen to grow a flawless layer of SiO₂ just a few nanometers thick. This insulator prevents current from leaking from the gate into the channel, while allowing the gate\'s electric field to pass through.'),
  S('Gate Oxidation & Poly', 'Deposit Polysilicon', 'LPCVD', 'polydep',
    'A thick layer of Polycrystalline Silicon is deposited over the entire wafer via Chemical Vapor Deposition using Silane gas (SiH₄). This heavily conductive material will serve as the physical electrode (the "Gate") that turns the transistor on and off.'),
  S('Gate Oxidation & Poly', 'Pattern & Etch Gates', 'Lithography & RIE', 'gate',
    'High-resolution DUV lithography prints the gate lines. A highly anisotropic (perfectly vertical) plasma etch carves away the exposed polysilicon, stopping precisely when it hits the ultra-thin gate oxide. The width of this remaining poly line is the "Node Size" (180 nm), which dictates the transistor\'s switching speed.'),

  // ── S/D Extensions (LDD) ──────────────────────────────────────────────────
  S('S/D Extensions (LDD)', 'NMOS SDE Implant (Arsenic)', 'Ion Implantation', 'sde',
    'After masking the PMOS, a very low-energy, shallow Arsenic implant is performed on the NMOS. This creates "Source/Drain Extensions" (Lightly Doped Drains). By grading the doping concentration near the channel, we prevent "Hot-Carrier Injection" — a phenomenon where electrons tunnel through the gate oxide and destroy the transistor over time.'),
  S('S/D Extensions (LDD)', 'PMOS SDE Implant (BF₂)', 'Ion Implantation', 'sde',
    'The mask is swapped, and a shallow Boron-Fluoride (BF₂) implant forms the Source/Drain Extensions for the PMOS transistors.'),

  // ── Spacer Formation ──────────────────────────────────────────────────────
  S('Spacer Formation', 'Deposit Oxide/Nitride Stack', 'CVD', 'sde',
    'A conformal layer of TEOS Oxide and Silicon Nitride is deposited globally over the entire wafer. "Conformal" means it coats the vertical sidewalls of the polysilicon gates just as thickly as the flat horizontal surfaces.'),
  S('Spacer Formation', 'Etch Sidewall Spacers', 'Anisotropic RIE', 'spacer',
    'A highly directional vertical plasma etch removes the oxide/nitride from all flat horizontal surfaces. However, the material on the vertical sidewalls of the gates is too thick to be etched away entirely. This leaves behind distinct protective "Spacers" hugging the sides of every gate.'),

  // ── Source/Drain ──────────────────────────────────────────────────────────
  S('Source/Drain', 'NMOS Heavy S/D Implant', 'Ion Implantation', 'sd',
    'With the PMOS masked, a high-dose, high-energy Arsenic implant is fired into the NMOS. The polysilicon gate and the newly formed sidewall spacers physically block the ions from entering the channel. This "self-aligns" the deep source and drain regions perfectly to the edges of the spacers.'),
  S('Source/Drain', 'PMOS Heavy S/D Implant', 'Ion Implantation', 'sd',
    'The mask is swapped, and a heavy Boron implant forms the deep P+ Source and Drain regions for the PMOS transistors, again perfectly self-aligned by the spacers.'),
  S('Source/Drain', 'Activation Anneal (RTA)', 'Rapid Thermal Annealing', 'sd',
    'A final high-temperature RTA heals the extensive crystal damage caused by the heavy implants and activates the dopants. The physical transistors are now fully formed and functional, but they still need to be wired together.'),

  // ── Salicide ──────────────────────────────────────────────────────────────
  S('Salicide', 'Deposit Cobalt/Titanium', 'PVD (Sputtering)', 'sd',
    'To reduce electrical resistance, we need to metalize the silicon contacts. The wafer is bombarded with Argon ions to sputter a thin sheet of Cobalt, capped with Titanium, over the entire wafer surface.'),
  S('Salicide', 'Form Cobalt Silicide (RTA)', 'Thermal Annealing', 'silicide',
    'During a moderate temperature bake, the Cobalt chemically reacts with the underlying silicon to form Cobalt Silicide (CoSi₂) — a highly conductive, metal-like compound. Crucially, the Cobalt sitting on top of the oxide spacers does NOT react, meaning the silicide forms strictly on the source, drain, and gate (Self-Aligned Silicide = "Salicide").'),
  S('Salicide', 'Strip Unreacted Metal', 'Wet Etch', 'silicide',
    'A selective wet etch washes away the unreacted Cobalt and Titanium from the oxide spacers, leaving the conductive Silicide exclusively on the electrical contact points. This prevents short-circuits between the gate and the source/drain.'),

  // ── 1st Interconnect ──────────────────────────────────────────────────────
  S('1st Interconnect', 'Deposit ILD (BPSG)', 'CVD', 'bpsg',
    'An Inter-Layer Dielectric (ILD) composed of Boro-Phospho-Silicate Glass (BPSG) is deposited to deeply bury and electrically insulate the transistors from the upcoming metal wiring layers.'),
  S('1st Interconnect', 'Planarize (CMP)', 'Chemical-Mechanical Polishing', 'bpsg',
    'Because the underlying transistors create a bumpy topography, CMP is used to grind the BPSG glass down to a perfectly flat, mirror-like surface. A flat surface is strictly required to keep the upcoming lithography lasers perfectly in focus.'),
  S('1st Interconnect', 'Etch Contact Holes', 'RIE', 'contact',
    'Lithography patterns the contact points, and a deep, narrow plasma etch bores vertical holes through the thick BPSG glass, stopping exactly on the silicided source, drain, and gate regions of the transistors.'),
  S('1st Interconnect', 'Tungsten Plug Fill', 'CVD & CMP', 'contact',
    'A thin Titanium-Nitride (TiN) adhesion barrier is sprayed into the holes, followed by Tungsten (W) gas deposition which fills the contact holes completely. A CMP step grinds away the surface tungsten, leaving behind flush, solid metal "plugs" inside the holes.'),
  S('1st Interconnect', 'Metal-1 Wiring', 'Sputter & Etch', 'metal1',
    'A sheet of Aluminum-Copper alloy (the first wiring layer, Metal-1) is sputtered over the wafer, connecting to the Tungsten plugs. Lithography and plasma etching carve this solid sheet into microscopic wires that route power and logic signals between adjacent transistors.'),

  // ── Upper Interconnects ───────────────────────────────────────────────────
  S('Upper Interconnects', 'Deposit IMD', 'CVD', 'imd',
    'An Inter-Metal Dielectric (IMD) is deposited over the Metal-1 wires to insulate them. Modern chips use Low-K dielectrics here to reduce parasitic capacitance (which causes signal delay and heat) between the tightly packed wires.'),
  S('Upper Interconnects', 'Via Etch & Fill', 'RIE & Tungsten CVD', 'imd',
    'Just like the first contacts, vertical holes called "Vias" are etched through the IMD to expose the Metal-1 wires below. These vias are filled with Tungsten plugs to bridge the vertical gap to the next metal layer.'),
  S('Upper Interconnects', 'Metal-2 Wiring', 'Sputter & Etch', 'metal2',
    'The second layer of Aluminum wiring (Metal-2) is deposited and etched. Metal-2 wires are typically routed perpendicular to Metal-1 wires to minimize electromagnetic cross-talk. This IMD -> Via -> Metal cycle is repeated 5 to 10 times to create the complex 3D highway of interconnects needed for a modern processor.'),

  // ── Passivation & Packaging ───────────────────────────────────────────────
  S('Passivation', 'Final Passivation', 'PECVD', 'passiv',
    'The completed wafer is sealed inside a thick, impenetrable armor of Silicon Nitride and Oxynitride. This passivation layer protects the delicate microscopic circuitry from physical scratches, humidity, and ionic contamination from the outside world.'),
  S('Passivation', 'Open Bond Pads', 'RIE', 'pad',
    'A final lithography and etch step cuts large windows through the passivation armor, exposing the massive top-level metal pads. These exposed pads are the only way electrical signals can enter or exit the chip.'),
  S('Packaging', 'Test, Dice & Package', 'Probe, Saw & Wirebond', 'pad',
    'Robotic probes test every single chip on the wafer for defects. The wafer is then sliced into individual chips (dies) using a diamond-tipped saw. Good chips are glued into plastic or ceramic packages, and microscopic gold wires are bonded between the chip\'s exposed pads and the external pins of the package. The CMOS chip is now complete.')
];
