'use client';
import { useId } from 'react';
import type { ParameterDescriptor } from '@/domain/parameters/parameter.schema';

interface Props {
  descriptor: ParameterDescriptor;
  value: number | string;
  onChange: (value: number | string) => void;
}

/**
 * Renders the correct control for a parameter purely from its descriptor —
 * continuous (linear or log slider) or enum select. Adding a device with new
 * parameters needs no new UI code. Contains zero domain logic.
 */
export function ParameterControl({ descriptor, value, onChange }: Props) {
  const id = useId();
  const { kind, label } = descriptor;

  if (kind.type === 'enum') {
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm text-ink-muted">
          {label}
        </label>
        <select
          id={id}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md bg-black/[0.04] dark:bg-white/5 px-2 py-1.5 text-sm text-ink ring-1 ring-black/10 dark:ring-white/10"
        >
          {kind.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  const display = formatDisplay(descriptor, numeric);

  // Log-scale sliders operate on a normalized [0,1] track mapped to a decade range.
  const isLog = kind.logScale === true;
  const sliderValue = isLog ? toLog(numeric, kind.min, kind.max) : numeric;
  const sliderMin = isLog ? 0 : kind.min;
  const sliderMax = isLog ? 1 : kind.max;
  const sliderStep = isLog ? 0.001 : kind.step;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm text-ink-muted">
          {label}
        </label>
        <span className="font-mono text-sm tabular-nums text-ink">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderValue}
        aria-valuetext={display}
        onChange={(e) => {
          const raw = Number(e.target.value);
          onChange(isLog ? fromLog(raw, kind.min, kind.max) : raw);
        }}
        className="accent-accent"
      />
    </div>
  );
}

function formatDisplay(descriptor: ParameterDescriptor, value: number): string {
  if (descriptor.kind.type !== 'continuous') return String(value);
  const d = descriptor.kind.display;
  if (!d) return `${Number(value.toPrecision(3))} ${descriptor.unit === '1' ? '' : descriptor.unit}`;
  const scaled = value / d.scale;
  return `${Number(scaled.toPrecision(3))} ${d.symbol}`;
}

const toLog = (v: number, min: number, max: number) =>
  (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
const fromLog = (t: number, min: number, max: number) =>
  10 ** (Math.log10(min) + t * (Math.log10(max) - Math.log10(min)));
