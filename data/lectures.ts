// Maps each curriculum module (data/curriculum.ts) to its matching module in
// AVSAR's live "VLSI Foundations" course, so an article can link back to the
// relevant lessons. Ranges below are the REAL global topic numbers (1-171)
// verified from the course roadmap on 2026-08-19. A lesson opens at:
//   https://avsar.rootstocktech.co.in/courses/vlsi-foundations?topic=<N>
// This is a MODULE-LEVEL link: it lands on the first lesson of the module's
// topic range (accurate by construction, no per-article guessing).

export const COURSE_BASE =
  "https://avsar.rootstocktech.co.in/courses/vlsi-foundations";

export const COURSE_ROADMAP = `${COURSE_BASE}/roadmap`;

export type LectureLink = {
  /** Curriculum module id (matches data/curriculum.ts). */
  moduleId: string;
  /** AVSAR module number (1-14). */
  avsarModule: number;
  /** AVSAR module title, for the chip label. */
  avsarModuleName: string;
  /** First and last global topic number of the module's lesson range. */
  topicStart: number;
  topicEnd: number;
  /** Deep link that opens the first lesson of the range. */
  url: string;
};

const make = (
  moduleId: string,
  avsarModule: number,
  avsarModuleName: string,
  topicStart: number,
  topicEnd: number
): LectureLink => ({
  moduleId,
  avsarModule,
  avsarModuleName,
  topicStart,
  topicEnd,
  url: `${COURSE_BASE}?topic=${topicStart}`,
});

// Our finer modules (physics/mos-device, cmos/advanced-devices, synthesis/timing)
// each fall inside a single broader AVSAR module; the topic range narrows the
// landing lesson to the right sub-group. "emerging" has no course lesson, so it
// is intentionally omitted (no link rather than a wrong one).
export const LECTURES: Record<string, LectureLink> = {
  industry: make("industry", 1, "Semiconductor Industry & Ecosystem", 1, 7),
  physics: make("physics", 2, "Semiconductor Physics & Devices", 8, 15),
  "mos-device": make("mos-device", 2, "Semiconductor Physics & Devices", 16, 20),
  cmos: make("cmos", 3, "CMOS Logic & Modern CMOS Technologies", 21, 31),
  "advanced-devices": make("advanced-devices", 3, "CMOS Logic & Modern CMOS Technologies", 32, 35),
  "digital-memory": make("digital-memory", 4, "Digital Electronics & Computer Architecture", 36, 52),
  "rtl-design": make("rtl-design", 5, "RTL Design & HDL", 53, 64),
  verification: make("verification", 6, "Functional Verification", 65, 78),
  synthesis: make("synthesis", 7, "Logic Synthesis & Timing Analysis", 79, 84),
  timing: make("timing", 7, "Logic Synthesis & Timing Analysis", 85, 91),
  "physical-design": make("physical-design", 8, "Physical Design", 92, 105),
  dft: make("dft", 9, "Design for Testability (DFT)", 106, 114),
  fabrication: make("fabrication", 10, "Semiconductor Fabrication", 115, 128),
  packaging: make("packaging", 11, "Semiconductor Packaging & Final Test", 129, 140),
  "eda-algorithms": make("eda-algorithms", 12, "EDA Algorithms & CAD", 141, 152),
  "low-power-signoff": make("low-power-signoff", 13, "Reliability, Power & Signoff", 153, 164),
  "full-flow": make("full-flow", 14, "Complete Digital VLSI Design Flow", 165, 171),
  // Emerging/research topics (RISC-V, quantum, photonics) aren't a single course
  // lesson, so this opens the full course roadmap instead of one topic.
  emerging: {
    moduleId: "emerging",
    avsarModule: 0,
    avsarModuleName: "VLSI Foundations course",
    topicStart: 1,
    topicEnd: 171,
    url: COURSE_ROADMAP,
  },
};

/** Returns the lesson link for a module id, or null if none exists. */
export function lectureForModule(moduleId: string | undefined): LectureLink | null {
  if (!moduleId) return null;
  return LECTURES[moduleId] ?? null;
}
