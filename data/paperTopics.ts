// Curated academic-search phrases per HRC module, used to fetch papers from
// arXiv. These are NOT the news keywords: single words/acronyms are too broad for
// scholarly search, so we hand-pick multi-word "topic phrases" that return precise
// exact-phrase matches. Module ids mirror data/curriculum.ts.

export type PaperTopicGroup = { moduleId: string; phrases: string[] };

export const PAPER_TOPICS: PaperTopicGroup[] = [
  { moduleId: "cobots", phrases: [
    "collaborative robot", "physical human-robot collaboration", "human-robot collaborative assembly",
    "impedance control collaborative robot", "compliant manipulator control",
  ] },
  { moduleId: "hri-safety", phrases: [
    "human-robot interaction", "safe human-robot interaction", "speed and separation monitoring",
    "collision avoidance for manipulators", "safety in human-robot collaboration", "intention recognition human-robot",
  ] },
  { moduleId: "industrial", phrases: [
    "robotic assembly", "robot motion planning", "trajectory optimization for manipulators",
    "industrial robot manipulation", "robotic bin picking", "force control assembly",
  ] },
  { moduleId: "humanoid", phrases: [
    "humanoid robot control", "bipedal locomotion", "whole-body control humanoid",
    "legged robot locomotion", "humanoid manipulation",
  ] },
  { moduleId: "mobile-field", phrases: [
    "autonomous mobile robot navigation", "simultaneous localization and mapping",
    "multi-robot coordination", "unmanned aerial vehicle control", "mobile manipulation",
  ] },
  { moduleId: "ai-perception", phrases: [
    "robot learning", "reinforcement learning for robotic manipulation", "imitation learning for manipulation",
    "vision-language-action model", "deep learning robotic grasping", "tactile sensing for manipulation",
  ] },
  { moduleId: "digital-twin", phrases: [
    "digital twin for robotics", "sim-to-real transfer", "domain randomization for robot learning",
    "robot simulation environment",
  ] },
  { moduleId: "industry-research", phrases: [
    "human-robot collaboration survey", "benchmark for robot learning", "robot manipulation dataset",
    "survey of collaborative robots",
  ] },
];
