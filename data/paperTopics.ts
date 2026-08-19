// Curated academic-search phrases per curriculum module, used to fetch papers
// from OpenAlex. These are NOT the news keywords: single words/acronyms are too
// broad for scholarly search, so we hand-pick multi-word "topic phrases" that
// return precise exact-phrase matches. Module ids mirror data/curriculum.ts.

export type PaperTopicGroup = { moduleId: string; phrases: string[] };

export const PAPER_TOPICS: PaperTopicGroup[] = [
  { moduleId: "industry", phrases: [
    "semiconductor technology roadmap", "Moore's law scaling", "transistor scaling",
    "semiconductor supply chain",
  ] },
  { moduleId: "physics", phrases: [
    "semiconductor device physics", "carrier transport in semiconductors", "wide bandgap semiconductor",
    "gallium nitride power device", "silicon carbide MOSFET", "PN junction",
  ] },
  { moduleId: "mos-device", phrases: [
    "MOSFET scaling", "threshold voltage", "short channel effects", "high-k metal gate",
    "gate oxide reliability",
  ] },
  { moduleId: "cmos", phrases: [
    "CMOS inverter", "CMOS logic design", "leakage power", "dynamic CMOS logic", "static CMOS logic",
  ] },
  { moduleId: "advanced-devices", phrases: [
    "FinFET", "gate-all-around transistor", "nanosheet transistor", "complementary FET",
    "negative capacitance FET", "tunnel FET",
  ] },
  { moduleId: "digital-memory", phrases: [
    "SRAM design", "DRAM scaling", "3D NAND flash memory", "cache memory architecture",
    "finite state machine", "floating point arithmetic",
  ] },
  { moduleId: "rtl-design", phrases: [
    "register transfer level design", "clock domain crossing", "Verilog hardware description language",
    "RTL design methodology", "asynchronous FIFO design",
  ] },
  { moduleId: "verification", phrases: [
    "functional verification", "universal verification methodology", "formal verification of hardware",
    "assertion-based verification", "constrained random verification", "coverage-driven verification",
  ] },
  { moduleId: "synthesis", phrases: [
    "logic synthesis", "high-level synthesis", "technology mapping", "logic optimization", "retiming",
  ] },
  { moduleId: "timing", phrases: [
    "static timing analysis", "clock tree synthesis", "timing closure", "setup and hold time", "on-chip variation",
  ] },
  { moduleId: "physical-design", phrases: [
    "placement and routing", "floorplanning", "routing congestion", "IR drop analysis",
    "parasitic extraction", "physical design automation",
  ] },
  { moduleId: "dft", phrases: [
    "design for testability", "automatic test pattern generation", "scan chain design",
    "built-in self-test", "stuck-at fault", "boundary scan",
  ] },
  { moduleId: "fabrication", phrases: [
    "EUV lithography", "chemical mechanical planarization", "atomic layer deposition",
    "ion implantation", "photolithography", "copper interconnect",
  ] },
  { moduleId: "packaging", phrases: [
    "advanced packaging", "chiplet integration", "through silicon via", "hybrid bonding",
    "high bandwidth memory", "wafer level packaging",
  ] },
  { moduleId: "eda-algorithms", phrases: [
    "electronic design automation", "placement algorithm", "global routing algorithm",
    "boolean satisfiability", "machine learning for chip design", "design space exploration",
  ] },
  { moduleId: "low-power-signoff", phrases: [
    "low power design", "clock gating", "power gating", "dynamic voltage and frequency scaling",
    "electromigration reliability", "power grid analysis",
  ] },
  { moduleId: "full-flow", phrases: [
    "system on chip design", "RTL to GDSII", "network on chip", "processor microarchitecture",
    "hardware software co-design",
  ] },
  { moduleId: "emerging", phrases: [
    "quantum computing", "silicon photonics", "neuromorphic computing", "in-memory computing",
    "spintronics", "RISC-V processor",
  ] },
];
