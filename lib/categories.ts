// How each curriculum module is shown as a magazine "section": a friendly
// label, a short nav name and an accent colour. IDs match curriculum module ids.
export type CategoryView = {
  id: string; // moduleId
  label: string;
  short: string;
  accent: string;
};

export const CATEGORY_VIEWS: CategoryView[] = [
  { id: "industry", label: "Industry & Overview", short: "Industry", accent: "#34d399" },
  { id: "physics", label: "Semiconductor Physics", short: "Physics", accent: "#38bdf8" },
  { id: "mos-device", label: "MOS Devices", short: "MOS", accent: "#c084fc" },
  { id: "cmos", label: "CMOS Circuits", short: "CMOS", accent: "#a78bfa" },
  { id: "advanced-devices", label: "Advanced Devices", short: "Advanced", accent: "#2dd4bf" },
  { id: "digital-memory", label: "Digital Design & Memory", short: "Digital", accent: "#818cf8" },
  { id: "rtl-design", label: "RTL / HDL Design", short: "RTL", accent: "#a3e635" },
  { id: "verification", label: "Functional Verification", short: "Verify", accent: "#f472b6" },
  { id: "synthesis", label: "Logic Synthesis", short: "Synthesis", accent: "#facc15" },
  { id: "timing", label: "Timing & STA", short: "Timing", accent: "#fb7185" },
  { id: "physical-design", label: "Physical Design (PnR)", short: "PnR", accent: "#22d3ee" },
  { id: "dft", label: "DFT / Test", short: "DFT", accent: "#38bdf8" },
  { id: "fabrication", label: "Fabrication", short: "Fab", accent: "#60a5fa" },
  { id: "packaging", label: "Packaging & Test", short: "Packaging", accent: "#fb923c" },
  { id: "eda-algorithms", label: "EDA Algorithms", short: "EDA", accent: "#e879f9" },
  { id: "low-power-signoff", label: "Low-Power & Signoff", short: "Signoff", accent: "#f59e0b" },
  { id: "full-flow", label: "Full-Chip Flow & Product", short: "Flow", accent: "#4ade80" },
  { id: "emerging", label: "Emerging", short: "Emerging", accent: "#6366f1" },
];

export const DEFAULT_ACCENT = "#22d3ee";

export const viewFor = (id: string): CategoryView | undefined =>
  CATEGORY_VIEWS.find((c) => c.id === id);

// Which sections appear in the center column vs the right sidebar (homepage).
// page.tsx filters these to only the ones that actually have stories.
export const CENTER_IDS = [
  "industry",
  "fabrication",
  "packaging",
  "physics",
  "advanced-devices",
  "digital-memory",
  "eda-algorithms",
  "full-flow",
];
export const SIDE_IDS = ["emerging", "verification", "physical-design"];
