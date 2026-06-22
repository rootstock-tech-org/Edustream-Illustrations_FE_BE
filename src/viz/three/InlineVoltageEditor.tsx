'use client';
import { useState } from 'react';
import { Html } from '@react-three/drei';
import { useDeviceStore } from '@/state/device.store';
import { getDevice } from '@/domain/devices/registry';
import { clampParameter } from '@/domain/parameters/parameter.schema';

/**
 * An editable voltage label pinned to the device (VDD, VIN). Click to type a new
 * value; commit writes through the existing `setParameter`. No separate control
 * panel needed — the voltage lives where the student looks.
 */
export function InlineVoltageEditor({
  position,
  paramKey,
  label,
}: {
  position: [number, number, number];
  paramKey: string;
  label: string;
}) {
  const value = useDeviceStore((s) => s.values[paramKey]);
  const setParameter = useDeviceStore((s) => s.setParameter);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    const n = Number(draft);
    const d = getDevice(deviceId)
      .parameterSchema.groups.flatMap((g) => g.parameters)
      .find((p) => p.key === paramKey);
    if (d && Number.isFinite(n)) setParameter(paramKey, clampParameter(d, n));
    setEditing(false);
  };

  return (
    <Html center distanceFactor={9} position={position}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          aria-label={`${label} voltage`}
          className="w-16 rounded-md bg-black/85 px-1.5 py-0.5 text-center font-mono text-xs text-white outline-none ring-1 ring-accent"
        />
      ) : (
        <button
          onClick={() => {
            setDraft(String(Number(value)));
            setEditing(true);
          }}
          className="flex items-center gap-1 rounded-md bg-black/65 px-2 py-0.5 text-[10px] ring-1 ring-black/10 dark:ring-white/10 backdrop-blur-sm transition hover:ring-accent/60"
        >
          {/* glow-cyan on the dark chip so it stays legible in both themes
              (light-theme --accent is a dark blue that vanishes on black) */}
          <span className="eyebrow text-[9px]" style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{label}</span>
          <span className="font-mono text-white">{Number(value).toFixed(2)} V</span>
          <span className="text-ink-muted">✎</span>
        </button>
      )}
    </Html>
  );
}
