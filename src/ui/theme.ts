import { create } from 'zustand';

export type Theme = 'light' | 'dark';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const s = localStorage.getItem('theme');
    if (s === 'dark' || s === 'light') return s;
  } catch {
    /* ignore */
  }
  return 'light';
}

function apply(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* ignore */
  }
}

/**
 * Presentation-only theme store (light = default). Toggling sets the `.dark`
 * class on <html> so every CSS-variable-driven token swaps, and persists the
 * choice. The 3D scene reads this to pick its background.
 */
export const useThemeStore = create<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>((set) => ({
  theme: readInitial(),
  toggle: () => set((s) => { const t: Theme = s.theme === 'dark' ? 'light' : 'dark'; apply(t); return { theme: t }; }),
  setTheme: (t) => { apply(t); set({ theme: t }); },
}));
