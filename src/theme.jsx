/**
 * theme.jsx
 * ---------
 * Tiny theme system for the whole platform: a provider that toggles a `light`
 * class on <html> (Tailwind `light:` variant) and persists the choice. Default
 * is the original dark "control room" look.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggle: () => {}, canvasBg: '#0a0e14' });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== 'undefined') return localStorage.getItem('sf-theme') || 'dark';
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    localStorage.setItem('sf-theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
      canvasBg: theme === 'light' ? '#e6ebf2' : '#0a0e14',
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
