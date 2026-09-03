// How each curriculum module is shown as a magazine "section": a friendly
// label, a short nav name and an accent colour. IDs match curriculum module ids.
export type CategoryView = {
  id: string; // moduleId
  label: string;
  short: string;
  accent: string;
};

export const CATEGORY_VIEWS: CategoryView[] = [
  { id: "cobots", label: "Collaborative Robots (Cobots)", short: "Cobots", accent: "#34d399" },
  { id: "hri-safety", label: "Human-Robot Interaction & Safety", short: "HRI & Safety", accent: "#f472b6" },
  { id: "industrial", label: "Industrial Robotics & Automation", short: "Industrial", accent: "#38bdf8" },
  { id: "humanoid", label: "Humanoid Robots", short: "Humanoid", accent: "#c084fc" },
  { id: "mobile-field", label: "Mobile Robots, AMR & Drones", short: "Mobile & Drones", accent: "#2dd4bf" },
  { id: "ai-perception", label: "AI, Perception & Manipulation", short: "AI & Perception", accent: "#818cf8" },
  { id: "digital-twin", label: "Digital Twins & Simulation", short: "Digital Twin", accent: "#facc15" },
  { id: "industry-research", label: "Industry, Market & Research", short: "Industry", accent: "#fb923c" },
];

export const DEFAULT_ACCENT = "#22d3ee";

export const viewFor = (id: string): CategoryView | undefined =>
  CATEGORY_VIEWS.find((c) => c.id === id);

// Which sections appear in the center column vs the right sidebar (homepage).
// page.tsx filters these to only the ones that actually have stories.
export const CENTER_IDS = [
  "industrial",
  "cobots",
  "humanoid",
  "mobile-field",
  "ai-perception",
  "industry-research",
];
export const SIDE_IDS = ["hri-safety", "digital-twin"];
