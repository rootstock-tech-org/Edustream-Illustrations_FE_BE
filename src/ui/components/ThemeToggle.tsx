'use client';
import { useEffect, useState } from 'react';
import { useThemeStore } from '@/ui/theme';

/** Light/dark theme switch (default light). */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="grid h-8 w-8 place-items-center rounded-full text-ink-muted ring-1 transition hover:text-ink"
      style={{ borderColor: 'transparent', boxShadow: 'inset 0 0 0 1px var(--glass-border)' }}
    >
      <span suppressHydrationWarning className="text-sm">
        {mounted && theme === 'dark' ? '☀' : '☾'}
      </span>
    </button>
  );
}
