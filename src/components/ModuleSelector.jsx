/**
 * ModuleSelector.jsx
 * ------------------
 * The persistent top bar: brand + a scrollable row of module options
 * ("1 · Foundations", …). Selecting one switches the active full-screen tool.
 */
import { Factory, Sun, Moon } from 'lucide-react';
import { MODULES } from '../data/modules';
import { useTheme } from '../theme';

export default function ModuleSelector({ activeSlug, onSelect }) {
  const { theme, toggle } = useTheme();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur light:border-slate-200 light:bg-white/90">
      <div className="flex shrink-0 items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-sky-500 text-slate-950">
          <Factory className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="hidden text-sm font-bold text-slate-100 sm:block light:text-slate-900">Smart Factory Tools</span>
      </div>

      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
        {MODULES.map((m) => {
          const active = m.slug === activeSlug;
          return (
            <button
              key={m.slug}
              onClick={() => onSelect(m.slug)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-transparent text-slate-950'
                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 light:border-slate-300 light:bg-slate-100 light:text-slate-600 light:hover:border-slate-400'
              }`}
              style={active ? { background: m.accent } : undefined}
              title={m.tagline}
            >
              <span className={active ? 'font-bold' : 'text-slate-500'}>{m.id}</span>
              <span className="whitespace-nowrap">{m.name}</span>
              {m.status === 'coming' && !active && (
                <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-500 light:bg-slate-200 light:text-slate-500">soon</span>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={toggle}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-900/60 text-slate-300 transition-colors hover:border-slate-500 light:border-slate-300 light:bg-slate-100 light:text-slate-600 light:hover:border-slate-400"
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </header>
  );
}
