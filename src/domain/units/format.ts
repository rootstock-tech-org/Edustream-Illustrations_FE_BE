import type { Quantity, SiUnit } from './quantity';

/**
 * Formats an SI quantity for human display with an engineering prefix.
 * Purely presentational — never used inside computation.
 */
const PREFIXES: ReadonlyArray<{ exp: number; symbol: string }> = [
  { exp: 12, symbol: 'T' },
  { exp: 9, symbol: 'G' },
  { exp: 6, symbol: 'M' },
  { exp: 3, symbol: 'k' },
  { exp: 0, symbol: '' },
  { exp: -3, symbol: 'm' },
  { exp: -6, symbol: 'µ' },
  { exp: -9, symbol: 'n' },
  { exp: -12, symbol: 'p' },
  { exp: -15, symbol: 'f' },
];

/** Units that should not receive engineering prefixes. */
const NON_PREFIXED: ReadonlySet<SiUnit> = new Set(['1', 'K', '1/V', '1/m^3', 'm^2/V·s', 'F/m^2']);

export function formatQuantity(q: Quantity, sigFigs = 3): string {
  if (q.value === 0) return `0 ${displayUnit(q.unit)}`;
  if (!Number.isFinite(q.value)) return `${q.value} ${displayUnit(q.unit)}`;

  if (NON_PREFIXED.has(q.unit)) {
    return `${toSig(q.value, sigFigs)} ${displayUnit(q.unit)}`;
  }

  const magnitude = Math.log10(Math.abs(q.value));
  const prefix =
    PREFIXES.find((p) => magnitude >= p.exp) ?? PREFIXES[PREFIXES.length - 1]!;
  const scaled = q.value / 10 ** prefix.exp;
  return `${toSig(scaled, sigFigs)} ${prefix.symbol}${displayUnit(q.unit)}`;
}

function displayUnit(unit: SiUnit): string {
  return unit === '1' ? '' : unit;
}

function toSig(value: number, sig: number): string {
  if (value === 0) return '0';
  const rounded = Number(value.toPrecision(sig));
  return String(rounded);
}
