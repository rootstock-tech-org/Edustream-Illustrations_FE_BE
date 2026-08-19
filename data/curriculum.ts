// The VLSI curriculum backbone, mapped to AVSAR's REAL 171-lecture VLSI
// Foundational Course. Every article is tagged to one of these modules by its
// keywords. Modules 1-17 mirror the actual lecture groups; "Emerging & Research"
// is an extra bucket for adjacent topics (RISC-V, quantum, photonics) that aren't
// core lectures but produce news students benefit from.

export type Module = {
  id: string;
  name: string;
  keywords: string[];
};

export const MODULES: Module[] = [
  {
    id: "industry",
    name: "Industry & Overview", // Lec 1-7
    keywords: [
      "semiconductor industry", "chip industry", "business model", "fabless", "foundry",
      "IDM", "semiconductor products", "AI accelerator", "AI chip", "FPGA",
      "moore's law", "dennard scaling", "technology node", "process node", "node roadmap",
      "2nm", "3nm", "5nm", "180nm", "1.4nm", "industry trend", "semiconductor market",
      "chip shortage", "semiconductor supply chain", "CHIPS Act", "semiconductor investment",
      "fab expansion", "new fab", "chip plant", "acquisition", "merger", "export controls",
      "semiconductor subsidy", "semiconductor policy", "TSMC", "Intel Foundry",
      "Samsung Foundry", "GlobalFoundries", "India Semiconductor Mission", "ISM", "OSAT",
      "Tata Electronics", "Semicon India", "Micron India", "power semiconductor",
      "power electronics", "semiconductor application", "semiconductor equipment",
      "lithography tool", "wafer starts", "fab utilization", "semiconductor capex",
      "design win", "angstrom era", "chip war",
    ],
  },
  {
    id: "physics",
    name: "Semiconductor Physics", // Lec 8-15
    keywords: [
      "semiconductor physics", "energy band", "band gap", "bandgap", "valence band",
      "conduction band", "crystal structure", "intrinsic semiconductor",
      "extrinsic semiconductor", "carrier transport", "drift current", "diffusion current",
      "carrier mobility", "doping", "dopant", "pn junction", "p-n junction", "forward bias",
      "reverse bias", "depletion region", "breakdown voltage", "avalanche breakdown",
      "zener", "compound semiconductor", "gallium nitride", "GaN", "silicon carbide", "SiC",
      "germanium", "2D material", "MoS2", "wide bandgap", "ultra-wide bandgap", "gallium oxide",
      "indium phosphide", "gallium arsenide", "GaAs", "heterojunction", "quantum well",
      "carrier concentration", "fermi level", "electron mobility", "hole mobility",
      "minority carrier", "recombination", "quantum tunneling", "hall effect",
    ],
  },
  {
    id: "mos-device",
    name: "MOS Devices", // Lec 16-20
    keywords: [
      "MOSFET", "MOS capacitor", "MOS transistor", "NMOS", "PMOS", "threshold voltage",
      "gate oxide", "field effect transistor", "transconductance", "subthreshold",
      "body effect", "CMOS process", "channel length modulation", "short channel effect",
      "DIBL", "gate leakage", "high-k dielectric", "high-k metal gate", "HKMG",
      "work function", "inversion layer", "strained silicon", "velocity saturation",
    ],
  },
  {
    id: "cmos",
    name: "CMOS Circuits", // Lec 21-31
    keywords: [
      "CMOS inverter", "voltage transfer characteristic", "noise margin", "static CMOS",
      "dynamic CMOS", "propagation delay", "rise time", "fall time", "fan-out", "fan-in",
      "drive strength", "dynamic power", "static power", "short-circuit power", "leakage power",
      "subthreshold leakage", "CMOS scaling", "pull-up network", "pull-down network",
      "transmission gate", "pass-transistor logic", "domino logic", "pseudo-nMOS",
      "tri-state buffer", "logical effort", "charge sharing", "body biasing",
    ],
  },
  {
    id: "advanced-devices",
    name: "Advanced Devices", // Lec 32-35
    keywords: [
      "FinFET", "GAAFET", "gate all around", "gate-all-around", "GAA", "nanosheet",
      "nanowire", "planar CMOS", "PPA", "performance power area", "RibbonFET", "CFET",
      "forksheet", "backside power delivery", "transistor scaling", "complementary FET",
      "nanosheet transistor", "monolithic 3D", "negative capacitance FET", "tunnel FET",
      "TFET", "FD-SOI", "FDSOI", "2D channel",
    ],
  },
  {
    id: "digital-memory",
    name: "Digital Design & Memory", // Lec 36-52
    keywords: [
      "number system", "binary arithmetic", "two's complement", "signed number",
      "fixed point", "floating point", "boolean algebra", "logic gate", "karnaugh map",
      "k-map", "combinational circuit", "flip-flop", "shift register", "register file",
      "finite state machine", "FSM", "timing diagram", "race condition", "memory hierarchy",
      "cache memory", "SRAM", "DRAM", "DDR", "LPDDR", "3D NAND", "NAND flash", "flash memory",
      "memory controller", "non-volatile memory", "SRAM cell", "sense amplifier",
      "word line", "bit line", "GDDR", "CXL memory", "memory bandwidth", "memory wall",
      "arithmetic logic unit", "binary multiplier", "carry lookahead", "barrel shifter",
    ],
  },
  {
    id: "rtl-design",
    name: "RTL / HDL Design", // Lec 53-64
    keywords: [
      "HDL", "Verilog", "VHDL", "SystemVerilog", "RTL", "register transfer level",
      "blocking assignment", "non-blocking assignment", "reset design", "parameterized module",
      "generate block", "RTL coding", "RTL synthesis", "hardware description language",
      "clock domain crossing", "synchronous design", "asynchronous FIFO", "datapath design",
      "pipelining", "FPGA prototyping", "IP core", "synthesizable RTL", "latch inference",
    ],
  },
  {
    id: "verification",
    name: "Functional Verification", // Lec 65-78
    keywords: [
      "functional verification", "design verification", "testbench", "directed testing",
      "constrained random", "assertion-based", "functional coverage", "code coverage",
      "linting", "regression testing", "coverage closure", "formal verification", "UVM",
      "universal verification methodology", "verification methodology", "SystemVerilog assertion",
      "UVM testbench", "coverage-driven verification", "scoreboard", "assertion-based verification",
      "property checking", "equivalence checking", "formal equivalence", "hardware emulation",
      "logic simulation", "gate-level simulation", "constrained-random verification", "x-propagation",
    ],
  },
  {
    id: "synthesis",
    name: "Logic Synthesis", // Lec 79-84
    keywords: [
      "logic synthesis", "technology mapping", "logic optimization", "area optimization",
      "gate-level netlist", "RTL to gate", "logic gate mapping", "Design Compiler",
      "Fusion Compiler", "Genus Synthesis", "retiming", "SDC constraints", "constraint-driven synthesis",
      "multi-level logic", "high-level synthesis", "C-to-RTL",
    ],
  },
  {
    id: "timing",
    name: "Timing & STA", // Lec 85-91
    keywords: [
      "static timing analysis", "STA", "setup time", "hold time", "critical path",
      "clock skew", "clock latency", "timing constraint", "false path", "multicycle path",
      "timing closure", "clock tree", "timing slack", "clock jitter", "clock uncertainty",
      "on-chip variation", "setup violation", "hold violation", "path delay", "useful skew",
      "generated clock", "time borrowing", "multicorner multimode",
    ],
  },
  {
    id: "physical-design",
    name: "Physical Design (PnR)", // Lec 92-105
    keywords: [
      "physical design", "standard cell", "floorplanning", "power planning",
      "clock tree synthesis", "CTS", "cell placement", "detailed routing", "global routing",
      "routing congestion", "signal integrity", "IR drop", "electromigration", "RC extraction",
      "parasitic extraction", "design rule check", "DRC", "LVS", "layout versus schematic",
      "physical verification", "place and route", "macro placement", "power grid",
      "timing-driven placement", "legalization", "antenna effect", "filler cell", "tap cell",
      "routing track", "metal layer", "clock tree synthesis",
    ],
  },
  {
    id: "dft",
    name: "DFT / Test", // Lec 106-114
    keywords: [
      "design for test", "DFT", "manufacturing test", "fault model", "stuck-at fault",
      "scan chain", "boundary scan", "JTAG", "ATPG", "automatic test pattern",
      "built-in self-test", "BIST", "MBIST", "LBIST", "test compression", "scan insertion",
      "design for testability", "scan flip-flop", "fault coverage", "transition fault",
      "at-speed test", "memory BIST", "logic BIST", "IJTAG", "test access port",
      "fault simulation", "stuck-at fault", "test pattern generation",
    ],
  },
  {
    id: "fabrication",
    name: "Fabrication", // Lec 115-128
    keywords: [
      "silicon wafer", "wafer fabrication", "crystal growth", "czochralski", "thermal oxidation",
      "ion implantation", "thin film deposition", "chemical vapor deposition", "CVD",
      "atomic layer deposition", "ALD", "photolithography", "EUV lithography", "EUV",
      "extreme ultraviolet", "high-NA EUV", "immersion lithography", "DUV", "photomask",
      "reticle", "ASML", "plasma etch", "etching", "chemical mechanical planarization",
      "shallow trench isolation", "STI", "gate stack", "metal interconnect", "copper interconnect",
      "front end of line", "back end of line", "FEOL", "BEOL", "photoresist",
      "epitaxy", "wafer yield", "cleanroom", "multi-patterning", "process integration",
      "dual damascene", "low-k dielectric", "self-aligned double patterning", "SADP",
      "directed self-assembly", "nanoimprint lithography", "critical dimension", "defect density",
      "in-line metrology", "wafer inspection", "hard mask", "wafer bonding",
    ],
  },
  {
    id: "packaging",
    name: "Packaging & Test", // Lec 129-140
    keywords: [
      "advanced packaging", "chiplet", "2.5D", "3D IC", "3D packaging", "hybrid bonding",
      "TSV", "through silicon via", "silicon interposer", "interposer", "CoWoS", "Foveros",
      "fan-out", "panel level packaging", "panel-level packaging", "fan-out panel", "FOPLP",
      "CoPoS", "wafer level packaging", "flip-chip", "ball grid array", "BGA", "wire bond",
      "wire bonding", "heterogeneous integration", "HBM", "high bandwidth memory",
      "thermal management", "burn-in", "wafer probing", "known good die", "die attach",
      "system in package", "SiP", "package substrate", "redistribution layer", "RDL",
      "microbump", "copper pillar", "underfill", "glass substrate", "co-packaged optics",
      "die stacking", "chip-on-wafer", "wafer-on-wafer", "fan-out wafer level", "FOWLP",
    ],
  },
  {
    id: "eda-algorithms",
    name: "EDA Algorithms", // Lec 141-152
    keywords: [
      "design automation", "electronic design automation", "EDA", "Synopsys", "Cadence",
      "Siemens EDA", "boolean optimization", "logic synthesis algorithm", "placement algorithm",
      "routing algorithm", "graph algorithm", "partitioning", "SAT solver",
      "boolean satisfiability", "binary decision diagram", "and-inverter graph", "AI in EDA",
      "machine learning EDA", "chip design software", "maze routing", "Steiner tree",
      "force-directed placement", "simulated annealing", "hypergraph partitioning",
      "design space exploration", "generative AI chip design", "AI-driven EDA", "cloud EDA",
    ],
  },
  {
    id: "low-power-signoff",
    name: "Low-Power & Signoff", // Lec 153-164
    keywords: [
      "clock gating", "power gating", "multi-Vt", "multi-threshold", "DVFS",
      "dynamic voltage frequency scaling", "ESD protection", "electrostatic discharge",
      "latch-up", "NBTI", "HCI", "hot carrier", "IR drop signoff", "timing signoff",
      "power signoff", "physical signoff", "low power design", "power integrity",
      "power domain", "UPF", "isolation cell", "retention register", "state retention",
      "power switch", "voltage island", "adaptive voltage scaling", "leakage reduction",
      "static power analysis", "dynamic voltage drop", "aging analysis", "reliability signoff",
    ],
  },
  {
    id: "full-flow",
    name: "Full-Chip Flow & Product", // Lec 165-171
    keywords: [
      "product requirement", "system specification", "architecture design", "VLSI design flow",
      "chip design flow", "RTL to GDSII", "tapeout", "silicon bring-up", "first silicon",
      "product validation", "engineering change order", "ECO", "SoC", "system on chip", "ASIC",
      "design flow", "processor design", "CPU architecture", "GPU architecture",
      "chip architecture", "core design", "microarchitecture", "post-silicon validation",
      "chip bring-up", "yield ramp", "volume production", "IP integration", "netlist handoff",
      "instruction set architecture", "vector processor", "DSP core", "AI processor architecture",
    ],
  },
  {
    id: "emerging",
    name: "Emerging & Research", // adjacent to the course, not a core lecture
    keywords: [
      "RISC-V", "quantum computing", "quantum computer", "qubit", "quantum chip", "quantum architecture",
      "superconducting qubit", "silicon photonics", "photonic computing", "optical interconnect",
      "neuromorphic", "spintronics", "in-memory computing", "compute-in-memory", "analog compute",
      "ferroelectric", "beyond CMOS", "emerging memory", "MRAM", "ReRAM", "carbon nanotube",
      "2D transistor", "photonic integrated circuit", "co-packaged optics", "optical computing",
      "memristor", "phase change memory", "FeFET", "analog in-memory", "UCIe",
      "spin qubit", "topological qubit", "trapped ion", "quantum error correction",
      "quantum processor", "transition metal dichalcogenide", "graphene electronics",
    ],
  },
];
