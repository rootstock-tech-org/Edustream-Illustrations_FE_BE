/**
 * Design tokens in JavaScript.
 *
 * Mirrors the @theme block in index.css, for the few places that need a colour
 * as a value rather than a class — canvas drawing, inline SVG, chart configs.
 * Keep the two in step: index.css is the source of truth for styling, this is
 * the source of truth for values.
 */

export const colors = {
  // Surfaces. The translucent ones are painted by the .glass class in
  // index.css, which is where the backdrop filter lives; these values are the
  // opaque equivalents, for canvas and SVG where there is nothing to blur.
  background: "#FFFFFF",
  surface: "#FFFFFF",
  panel: "#FFFFFF",
  sidebar: "#FFFFFF",
  hover: "#F2F5F9",
  subtle: "#F7F9FC",

  // Lines
  border: "#E4E9F0",
  borderStrong: "#C7D1DE",

  // Brand
  primary: "#1B4B8F",
  primaryHover: "#143A6E",
  primarySoft: "#EAF1FB",

  // Safety semantics
  success: "#0F7B4F",
  successSoft: "#E7F6EE",
  warning: "#B26A00",
  warningSoft: "#FDF3E2",
  danger: "#C42B1C",
  dangerSoft: "#FBEBE9",

  // Type
  text: "#0B2545",
  textSecondary: "#3D5A80",
  textMuted: "#8DA2BE",
};

/**
 * Colours used when drawing on a video frame.
 *
 * Video is unpredictable — dark machinery, bright floors, glare — so overlays
 * use fully saturated colour and a white vertex fill rather than the muted UI
 * palette, which disappears against real footage.
 */
export const overlay = {
  zoneStroke: "#DC2626",
  zoneFill: "rgba(220, 38, 38, 0.18)",
  zoneVertex: "#FFFFFF",
  cursor: "#2563EB",
};

export default colors;
