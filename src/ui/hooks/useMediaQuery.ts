'use client';
import { useEffect, useState } from 'react';

/**
 * SSR-safe media query. Always false on the server and on the first client
 * paint, so callers must treat `true` as "mounted AND matching" — that is what
 * keeps breakpoint-dependent inline styles out of the hydration diff.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [query]);
  return matches;
}
