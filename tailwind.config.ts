import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — components reference intent, not raw hex.
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--surface-elevated) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        highlight: 'rgb(var(--highlight) / <alpha-value>)',
        nmos: 'rgb(var(--nmos) / <alpha-value>)',
        pmos: 'rgb(var(--pmos) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Cambria', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
