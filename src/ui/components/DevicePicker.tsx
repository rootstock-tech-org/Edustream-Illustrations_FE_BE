'use client';
import { useDevice } from '@/ui/hooks/useDevice';

/** Curated device selector. New registered devices appear here automatically. */
export function DevicePicker() {
  const { devices, deviceId, setDevice } = useDevice();
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Device">
      {devices.map((d) => (
        <button
          key={d.id}
          role="tab"
          aria-selected={d.id === deviceId}
          onClick={() => setDevice(d.id)}
          className={`rounded-full px-3 py-1.5 text-sm transition ${
            d.id === deviceId
              ? 'bg-accent text-surface'
              : 'bg-white/5 text-ink-muted ring-1 ring-white/10 hover:text-ink'
          }`}
        >
          {d.name}
        </button>
      ))}
    </div>
  );
}
