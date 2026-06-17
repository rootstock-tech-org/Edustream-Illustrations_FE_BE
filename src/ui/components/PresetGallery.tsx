'use client';
import { useEffect, useRef, useState } from 'react';
import { listPresets } from '@/domain/devices/presets';
import { useDevice } from '@/ui/hooks/useDevice';

/**
 * Technology preset gallery. Applying a preset writes the parameter values via
 * the store; the normal pipeline computes the resulting behavior (presets carry
 * no precomputed outputs). Rendered as an accessible modal dialog.
 */
export function PresetGallery() {
  const [open, setOpen] = useState(false);
  const { setValues } = useDevice();
  const closeRef = useRef<HTMLButtonElement>(null);
  const presets = listPresets();

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const apply = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (preset) setValues(preset.values);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white/5 px-3 py-1 text-sm text-ink-muted ring-1 ring-white/10 hover:text-ink"
      >
        Presets
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Technology presets"
            className="glass-3 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Technology Presets</h2>
                <p className="text-sm text-ink-muted">Load a process and compare how the device behaves.</p>
              </div>
              <button ref={closeRef} onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-ink-muted hover:text-ink" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => apply(p.id)}
                  className="glass-2 lift flex flex-col items-start gap-2 rounded-xl p-4 text-left"
                >
                  <div className="flex w-full items-baseline justify-between">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="font-mono text-[10px] text-ink-muted">{p.node}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{p.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span key={t} className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
