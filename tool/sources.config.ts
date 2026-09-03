// Module A source config (mail requirement: tier-1 sources in a config file,
// not hardcoded in logic). Order matters — Top Headlines shows these first,
// Reuters first. Edit this list to change coverage/priority; no code changes.
export type TierSource = { name: string; domain: string };

export const TIER1_SOURCES: TierSource[] = [
  { name: "The Robot Report", domain: "therobotreport.com" },
  { name: "IEEE Spectrum", domain: "spectrum.ieee.org" },
  { name: "Reuters", domain: "reuters.com" },
  { name: "Associated Press", domain: "apnews.com" },
  { name: "Bloomberg", domain: "bloomberg.com" },
  { name: "TechCrunch", domain: "techcrunch.com" },
  { name: "The Verge", domain: "theverge.com" },
  { name: "Ars Technica", domain: "arstechnica.com" },
  { name: "MIT Technology Review", domain: "technologyreview.com" },
  { name: "Financial Times", domain: "ft.com" },
];
