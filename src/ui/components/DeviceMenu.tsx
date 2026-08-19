'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDevice } from '@/ui/hooks/useDevice';

export interface MenuSection {
  readonly label: string;
  readonly onSelect: () => void;
}

/**
 * Header menu: a hamburger that expands on hover (and on click / keyboard, so
 * it stays usable on touch and for screen readers) to reveal the device list.
 * Keeping the device tabs in here is what lets the header stay a slim wordmark
 * + two controls. `sections` carries the full-screen labs (Logic Gates,
 * Fabrication, …) that used to be their own header buttons — they live below a
 * divider so they stay reachable without cluttering the bar.
 */
export function DeviceMenu({ sections = [] }: { sections?: readonly MenuSection[] }) {
  const { devices, deviceId, setDevice } = useDevice();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  // Small grace period so the pointer can travel from the button to the panel.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  }, [cancelClose]);
  useEffect(() => cancelClose, [cancelClose]);

  // Escape and outside-clicks dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Devices"
        title="Devices"
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition hover:text-ink"
        style={{ boxShadow: 'inset 0 0 0 1px var(--glass-border)' }}
      >
        <span className="flex w-[15px] flex-col gap-[3px]" aria-hidden="true">
          <span className="h-[1.5px] w-full rounded-full bg-current" />
          <span className="h-[1.5px] w-full rounded-full bg-current" />
          <span className="h-[1.5px] w-full rounded-full bg-current" />
        </span>
      </button>

      {open && (
        // pt-2 (not mt-2) keeps the hover region contiguous with the button.
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            role="menu"
            aria-label="Devices and labs"
            // opaque, not .glass: a translucent menu over the instrument
            // cards is unreadable
            className="w-56 rounded-xl border border-[color:var(--hairline)] bg-surface-elevated p-1.5 shadow-2xl"
          >
            <p className="eyebrow px-3 pb-1 pt-1.5 text-[10px] text-accent">Device</p>
            {devices.map((d) => {
              const active = d.id === deviceId;
              return (
                <button
                  key={d.id}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setDevice(d.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? 'bg-accent text-white shadow-[0_0_16px_var(--accent-glow)]'
                      : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/5'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-current opacity-40'}`} />
                  {d.name}
                </button>
              );
            })}

            {sections.length > 0 && <div className="my-1.5 h-px bg-[color:var(--hairline)]" />}

            {sections.map((sec) => (
              <button
                key={sec.label}
                role="menuitem"
                onClick={() => {
                  sec.onSelect();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/5"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
                {sec.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
