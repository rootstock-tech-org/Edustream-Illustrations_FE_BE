import type { SiUnit } from '@/domain/units';
import type { ParameterValues, ParameterDescriptor } from '@/domain/parameters/parameter.schema';
import type { SimulationResult } from '@/domain/simulation/result.types';
import { findFormulaValue } from './derivation-query';
import { narrativeFor } from './tradeoffs';

/**
 * The structured "what just happened" explanation:
 *   What Changed → Physical Effect → Device Impact → Circuit Impact → Tradeoff
 *
 * Directions and magnitudes are MEASURED from before/after engine results and
 * the derivation tree; the physical/tradeoff prose is curated mechanism keyed
 * by the change that actually occurred. No physics is invented.
 */
export interface MeasuredDelta {
  readonly from: number;
  readonly to: number;
  readonly percent: number;
  readonly unit: SiUnit;
}

export interface ImpactLine {
  readonly label: string;
  readonly delta: MeasuredDelta;
}

export interface ParamChange {
  readonly key: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly percent: number | null;
}

export interface StructuredImpact {
  readonly whatChanged: readonly ParamChange[];
  readonly physical: string | null;
  readonly deviceImpact: readonly ImpactLine[];
  readonly circuitImpact: readonly ImpactLine[];
  readonly tradeoff: string | null;
}

export interface ImpactInput {
  readonly descriptors: readonly ParameterDescriptor[];
  readonly prevValues: ParameterValues;
  readonly prevResult: SimulationResult;
  readonly curValues: ParameterValues;
  readonly curResult: SimulationResult;
}

const pct = (from: number, to: number) => (from !== 0 ? ((to - from) / Math.abs(from)) * 100 : 0);

export function buildImpact(input: ImpactInput): StructuredImpact | null {
  const { descriptors, prevValues, prevResult, curValues, curResult } = input;

  const changes: ParamChange[] = [];
  for (const d of descriptors) {
    const a = prevValues[d.key];
    const b = curValues[d.key];
    if (a === undefined || b === undefined || a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') {
      changes.push({ key: d.key, label: d.label, from: formatParam(d, a), to: formatParam(d, b), percent: pct(a, b) });
    } else {
      changes.push({ key: d.key, label: d.label, from: String(a), to: String(b), percent: null });
    }
  }
  if (changes.length === 0) return null;

  // Pick the dominant numeric change to anchor the mechanism narrative.
  const primary = [...changes]
    .filter((c) => c.percent !== null)
    .sort((x, y) => Math.abs(y.percent!) - Math.abs(x.percent!))[0];
  const narrative = primary ? narrativeFor(primary.key, primary.percent! > 0 ? 'increase' : 'decrease') : null;

  // Device impact: the device-level quantities that actually moved, measured
  // from the inputs (W/L) and the derivation tree (k', V_th). Only meaningful
  // changes are surfaced, so each reported line reflects a real effect.
  const deviceImpact: ImpactLine[] = [];
  const wl = (v: ParameterValues) => Number(v.W) / Number(v.L);
  pushIfChanged(deviceImpact, 'Drive ratio W/L', wl(prevValues), wl(curValues), '1');
  pushIfChanged(deviceImpact, "Process k′ = µ·C_ox", findFormulaValue(prevResult, 'process-transconductance'), findFormulaValue(curResult, 'process-transconductance'), 'A/V^2');
  pushIfChanged(deviceImpact, 'Threshold V_th', findFormulaValue(prevResult, 'threshold-voltage'), findFormulaValue(curResult, 'threshold-voltage'), 'V');

  // Circuit impact: measured propagation delay and leakage deltas.
  const circuitImpact: ImpactLine[] = [
    metricLine('Propagation delay', prevResult.metrics.propagationDelay.quantity.value, curResult.metrics.propagationDelay.quantity.value, 's'),
    metricLine('Leakage', prevResult.metrics.leakage.quantity.value, curResult.metrics.leakage.quantity.value, 'A'),
    metricLine('Total power', prevResult.metrics.totalPower.quantity.value, curResult.metrics.totalPower.quantity.value, 'W'),
  ];

  return {
    whatChanged: changes,
    physical: narrative?.physical ?? null,
    deviceImpact,
    circuitImpact,
    tradeoff: narrative?.tradeoff ?? null,
  };
}

function metricLine(label: string, from: number, to: number, unit: SiUnit): ImpactLine {
  return { label, delta: { from, to, percent: pct(from, to), unit } };
}

/** Append a measured line only if it moved meaningfully (≥0.5%). */
function pushIfChanged(out: ImpactLine[], label: string, from: number | null, to: number | null, unit: SiUnit): void {
  if (from === null || to === null) return;
  const percent = pct(from, to);
  if (Math.abs(percent) >= 0.5) out.push({ label, delta: { from, to, percent, unit } });
}

function formatParam(d: ParameterDescriptor, value: number): string {
  if (d.kind.type === 'continuous' && d.kind.display) {
    return `${Number((value / d.kind.display.scale).toPrecision(3))} ${d.kind.display.symbol}`;
  }
  return `${Number(value.toPrecision(3))}${d.unit === '1' ? '' : ' ' + d.unit}`;
}
