/**
 * Widgets.jsx (Robotics)
 * ----------------------
 * Explainers: the six robot types, kinematics concepts, applications and cell
 * safety.
 */
import { useState } from 'react';
import { ROBOT_TYPES, KINEMATICS, APPLICATIONS, SAFETY } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-orange-400/60 bg-orange-500/25 text-white shadow-[0_3px_12px_-2px_rgba(251,146,60,0.5)] ring-1 ring-orange-400/30 light:bg-orange-400 light:text-slate-900 light:border-orange-500'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

function Explorer({ items, prompt, badge }) {
  const [sel, setSel] = useState(items[0].id);
  const it = items.find((x) => x.id === sel) ?? items[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">{prompt}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{it.name}</p>
          {badge && it[badge] && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold text-orange-300 light:bg-slate-200 light:text-orange-700">{it[badge]}</span>}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{it.detail}</p>
      </div>
    </div>
  );
}

export function RobotTypes() {
  return <Explorer items={ROBOT_TYPES} prompt="The six industrial robot types." badge="dof" />;
}
export function KinematicsExplorer() {
  return <Explorer items={KINEMATICS} prompt="How the arm's motion is described." />;
}
export function Applications() {
  return <Explorer items={APPLICATIONS} prompt="What robot arms actually do." />;
}
export function Safety() {
  return <Explorer items={SAFETY} prompt="Keeping people safe around robots." />;
}
