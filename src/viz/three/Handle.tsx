'use client';
import { useState } from 'react';
import { Html, Line } from '@react-three/drei';
import { useDeviceStore } from '@/state/device.store';
import { getDevice } from '@/domain/devices/registry';
import { clampParameter, type ParameterDescriptor } from '@/domain/parameters/parameter.schema';
import { useParamDrag } from './useParamDrag';
import { color } from './palette';

/**
 * A persistent, discoverable, keyboard-accessible geometry grip. It always shows
 * a value chip + an axis dimension indicator (so the affordance is visible, not
 * hidden until hover). Drag to edit, or focus and use arrow keys (Shift = ×10,
 * Home/End = min/max) — exposed as an ARIA slider. Writes the existing setter.
 */
export function Handle({
  position,
  axis,
  paramKey,
  label,
  dim,
}: {
  position: [number, number, number];
  axis: 'x' | 'y';
  paramKey: string;
  label: string;
  dim?: [number, number, number][];
}) {
  const onPointerDown = useParamDrag(paramKey, axis);
  const value = useDeviceStore((s) => s.values[paramKey]);
  const deviceId = useDeviceStore((s) => s.deviceId);
  const setParameter = useDeviceStore((s) => s.setParameter);
  const [active, setActive] = useState(false);

  const d = descriptorFor(deviceId, paramKey);
  const display = formatParam(d, Number(value));
  const cursor = axis === 'x' ? 'ew-resize' : 'ns-resize';
  const continuous = d?.kind.type === 'continuous' ? d.kind : null;

  const nudge = (steps: number) => {
    if (!d || !continuous) return;
    const cur = Number(useDeviceStore.getState().values[paramKey]);
    setParameter(paramKey, clampParameter(d, cur + steps * continuous.step));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!d || !continuous) return;
    const big = e.shiftKey ? 10 : 1;
    let handled = true;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') nudge(big);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') nudge(-big);
    else if (e.key === 'Home') setParameter(paramKey, clampParameter(d, continuous.min));
    else if (e.key === 'End') setParameter(paramKey, clampParameter(d, continuous.max));
    else handled = false;
    if (handled) e.preventDefault();
  };

  return (
    <group position={position}>
      {dim && <Line points={dim} color={active ? color('accent') : '#8a8f99'} lineWidth={active ? 2.5 : 1.25} transparent opacity={active ? 0.95 : 0.55} />}
      <mesh
        onPointerDown={onPointerDown}
        onPointerOver={(e) => {
          e.stopPropagation();
          setActive(true);
          document.body.style.cursor = cursor;
        }}
        onPointerOut={() => {
          setActive(false);
          document.body.style.cursor = '';
        }}
        scale={active ? 1.3 : 1}
      >
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial color="#ffffff" emissive={color('accent')} emissiveIntensity={active ? 1.4 : 0.55} metalness={0.3} roughness={0.3} />
      </mesh>
      <Html center distanceFactor={8} position={[0, 0.26, 0]} zIndexRange={[15, 0]}>
        <button
          role="slider"
          aria-label={`${label}, drag or arrow keys to adjust`}
          aria-valuemin={continuous?.min ?? 0}
          aria-valuemax={continuous?.max ?? 1}
          aria-valuenow={Number(value)}
          aria-valuetext={display}
          onKeyDown={onKeyDown}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          className={`flex items-center gap-1 whitespace-nowrap rounded-md text-[10px] transition focus-visible:opacity-100 ${
            active
              ? 'bg-accent/90 px-1.5 py-0.5 opacity-100 ring-1 ring-white/30 backdrop-blur-sm'
              : 'px-0 py-0 opacity-0'
          }`}
        >
          {/* label + value surface ONLY on hover/focus, so idle grips never
              print text over the device geometry (no overlap) */}
          <span className="eyebrow text-[9px] text-white">{label}</span>
          {active && <span className="font-mono text-white" style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{display}</span>}
        </button>
      </Html>
    </group>
  );
}

function descriptorFor(deviceId: string, key: string): ParameterDescriptor | undefined {
  return getDevice(deviceId)
    .parameterSchema.groups.flatMap((g) => g.parameters)
    .find((p) => p.key === key);
}

function formatParam(d: ParameterDescriptor | undefined, value: number): string {
  if (d && d.kind.type === 'continuous' && d.kind.display) {
    return `${Number((value / d.kind.display.scale).toPrecision(3))} ${d.kind.display.symbol}`;
  }
  return String(Number(value.toPrecision(3)));
}
