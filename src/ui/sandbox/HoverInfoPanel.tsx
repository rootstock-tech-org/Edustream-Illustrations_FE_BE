import React from 'react';
import { COMPONENT_DICTIONARY } from '@/lib/componentInfo';

export function HoverInfoPanel({ componentId }: { componentId: string }) {
  const info = COMPONENT_DICTIONARY[componentId];
  if (!info) return null;

  return (
    <div className="glass absolute left-[270px] top-4 z-50 flex w-72 flex-col gap-3 rounded-xl p-4 shadow-2xl border border-glass-border bg-surface-elevated animate-in fade-in zoom-in-95 duration-200">
      <h3 className="text-sm font-bold text-accent">{info.title}</h3>
      <p className="text-xs text-ink-muted leading-relaxed">{info.description}</p>
      
      {info.columns && info.rows && (
        <div className="mt-2 overflow-hidden rounded-md border border-glass-border">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface/50 text-ink">
              <tr>
                {info.columns.map((col, i) => (
                  <th key={i} className="px-3 py-2 border-b border-glass-border font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface-elevated/50">
              {info.rows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-glass-border/50 last:border-0 hover:bg-surface/30 transition-colors">
                  {row.map((cell, cIdx) => {
                    const isOutput = cIdx === row.length - 1;
                    return (
                      <td 
                        key={cIdx} 
                        className={`px-3 py-1.5 ${isOutput ? 'text-accent font-bold' : 'text-ink-muted'}`}
                      >
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
