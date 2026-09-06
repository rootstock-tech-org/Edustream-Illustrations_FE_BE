/**
 * Non-colour design tokens.
 *
 * Spacing, radius, and type scale, for the same reason colors.js exists: some
 * contexts need a value rather than a Tailwind class.
 */

import colors, { overlay } from "./colors";

export const theme = {
  colors,
  overlay,

  font: {
    family:
      "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    size: {
      xs: "11px",
      sm: "13px",
      base: "14px",
      lg: "16px",
      xl: "20px",
      display: "28px",
    },
    weight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },

  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "999px",
  },

  shadow: {
    panel: "0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)",
    raised: "0 2px 4px rgb(15 23 42 / 0.04), 0 4px 12px rgb(15 23 42 / 0.08)",
    overlay: "0 8px 24px rgb(15 23 42 / 0.12)",
  },

  /** 4px base grid. spacing(4) === "16px". */
  spacing: (n) => `${n * 4}px`,
};

export default theme;
