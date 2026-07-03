'use client';
import { useEffect, useId, useRef, useState } from 'react';
import type { ParameterDescriptor } from '@/domain/parameters/parameter.schema';

interface Props {
  descriptor: ParameterDescriptor;
  value: number | string;
  onChange: (value: number | string) => void;
  /** Geometry section: lock the typed box to EXACTLY 2 decimal places (display
   *  units) — value rounded to 2 dp on entry and always shown as e.g. 180.00. */
  exact2?: boolean;
}

/**
 * Renders the correct control for a parameter purely from its descriptor —
 * continuous (linear or log slider) or enum select. Continuous parameters
 * support BOTH input modes: drag the slider OR type an exact value into the
 * number box (shown in the parameter's display units). Adding a device with new
 * parameters needs no new UI code. Contains zero domain logic.
 */
export function ParameterControl({ descriptor, value, onChange, exact2 = false }: Props) {
  const id = useId();
  const { kind, label } = descriptor;

  // Typed-value box: local text so the user can type freely; it re-syncs from
  // the committed value whenever the field is NOT focused (slider drag, on-device
  // grip drag, preset load). Hooks are declared before any early return so the
  // hook order stays stable across descriptor kinds.
  const numeric = typeof value === 'number' ? value : Number(value);
  const scale = kind.type === 'continuous' ? kind.display?.scale ?? 1 : 1;
  const symbol =
    kind.type === 'continuous'
      ? kind.display?.symbol ?? (descriptor.unit === '1' ? '' : descriptor.unit)
      : '';
  // Log-scale params (e.g. doping ~1e23) can't sensibly be fixed to 2 decimals,
  // so exact-2-dp mode only applies to ordinary linear params.
  const isLog = kind.type === 'continuous' && kind.logScale === true;
  const exact = exact2 && !isLog;
  // exact → always exactly 2 decimals (keep trailing zeros: 180 → "180.00").
  // Otherwise the prior behaviour: 4 significant figures.
  const scaledStr = exact
    ? (numeric / scale).toFixed(2)
    : String(Number((numeric / scale).toPrecision(4)));
  const [text, setText] = useState(scaledStr);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(scaledStr);
  }, [scaledStr]);

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
          className="rounded-md bg-black/[0.04] px-2 py-1.5 text-sm text-ink ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10"
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

  const display = formatDisplay(descriptor, numeric);

  // Log-scale sliders operate on a normalized [0,1] track mapped to a decade range.
  const sliderValue = isLog ? toLog(numeric, kind.min, kind.max) : numeric;
  const sliderMin = isLog ? 0 : kind.min;
  const sliderMax = isLog ? 1 : kind.max;
  const sliderStep = isLog ? 0.001 : kind.step;

  const commitTyped = (input: string) => {
    // exact2 → never let the box hold more than 2 decimals: truncate the typed
    // text immediately so a 3rd decimal digit simply can't be entered.
    const raw = exact ? limitDecimals(input, 2) : input;
    setText(raw);
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) return;
    const rounded = exact ? Math.round(n * 100) / 100 : n; // lock to 2 dp in display units
    onChange(rounded * scale); // SI; setter clamps to range
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm text-ink-muted">
          {label}
        </label>
        {/* type-to-set box (display units) */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            // exact → 0.01 step so the box takes EXACTLY 2-decimal values
            // (e.g. L = 180.25 nm); other params keep their natural step.
            step={isLog ? 'any' : exact ? 0.01 : Number((kind.step / scale).toPrecision(4))}
            value={text}
            aria-label={`${label} value`}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              setText(scaledStr);
            }}
            onChange={(e) => commitTyped(e.target.value)}
            className="w-20 rounded-md border border-[color:var(--hairline)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-right font-mono text-sm tabular-nums text-ink outline-none focus:ring-2 focus:ring-accent/40"
          />
          {symbol && <span className="w-8 text-xs text-ink-muted">{symbol}</span>}
        </div>
      </div>
      {/* drag-to-set slider */}
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

/** Truncate a typed numeric string to at most `max` decimal places (no rounding),
 *  so the field can never hold more than `max` decimals while the user types. */
function limitDecimals(s: string, max: number): string {
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot + 1 + max);
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
