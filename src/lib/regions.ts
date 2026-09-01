// Region options for Google News (country + language). Controls which country's
// news sources are returned.
export const REGIONS: { code: string; label: string }[] = [
  { code: "WORLD", label: "Worldwide" },
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "SG", label: "Singapore" },
];

export const DEFAULT_REGION = "IN";

// region code -> Google News gl/hl options. "WORLD" uses the global English
// edition (Google News has no separate worldwide edition), which surfaces
// international wire services.
export function regionOpts(region?: string): { gl: string; hl: string } {
  const code = (region || DEFAULT_REGION).toUpperCase();
  if (code === "WORLD") return { gl: "US", hl: "en-US" };
  return { gl: code, hl: `en-${code}` };
}
