'use client';
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Renders a LaTeX string with KaTeX. Presentation-only: it typesets the latex
 * that the FormulaRegistry already emits — no formula is defined here. Falls
 * back to the raw string on parse error and exposes the source for a11y.
 */
export function Equation({ latex, block = false, className = '' }: { latex: string; block?: boolean; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { displayMode: block, throwOnError: false, output: 'html' });
    } catch {
      return null;
    }
  }, [latex, block]);

  if (html === null) {
    return <code className={`font-mono text-ink-muted ${className}`}>{latex}</code>;
  }
  return (
    <span
      className={`${block ? 'block overflow-x-auto py-1' : 'inline-block'} ${className}`}
      role="math"
      aria-label={latex}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
