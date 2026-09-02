/**
 * ComingSoonTool.jsx
 * ------------------
 * Shown for modules whose interactive tool isn't built yet. Honest placeholder,
 * no fake interactivity.
 */
import { Wrench } from 'lucide-react';

export default function ComingSoonTool({ module }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-950/60 p-8 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: `${module.accent}22`, color: module.accent }}
        >
          <Wrench className="h-7 w-7" />
        </div>
        <p className="mt-4 text-xs uppercase tracking-widest text-slate-500">Module {module.id}</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-100">{module.name}</h2>
        <p className="mt-1 text-sm" style={{ color: module.accent }}>{module.tagline}</p>
        <p className="mt-4 text-sm text-slate-400">
          This module's interactive tool is being built next, in the same style as the Foundations tool.
        </p>
      </div>
    </div>
  );
}
