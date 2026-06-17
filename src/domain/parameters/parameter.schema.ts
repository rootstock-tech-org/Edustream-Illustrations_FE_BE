import type { SiUnit } from '@/domain/units';

/**
 * Declarative description of a single tunable input. The UI control panel is
 * GENERATED from a list of these — so adding a device with new parameters
 * automatically yields correct, validated, labelled controls with no UI edits.
 */
export interface ParameterDescriptor {
  /** Stable key used in the parameter-values record. */
  readonly key: string;
  /** Human label, e.g. "Gate Length (L)". */
  readonly label: string;
  /** SI unit the stored value is expressed in. */
  readonly unit: SiUnit;
  readonly kind: ParameterKind;
  /** Concept id for an inline "what is this?" link. */
  readonly conceptId?: string;
}

export type ParameterKind = ContinuousParameter | EnumParameter;

export interface ContinuousParameter {
  readonly type: 'continuous';
  /** Inclusive lower bound (SI). */
  readonly min: number;
  /** Inclusive upper bound (SI). */
  readonly max: number;
  /** Default value (SI). */
  readonly default: number;
  /** Step granularity for sliders (SI). */
  readonly step: number;
  /**
   * Preferred display unit + scale for humans (e.g. nm at 1e-9). Presentation
   * only; the stored value stays SI.
   */
  readonly display?: { readonly symbol: string; readonly scale: number };
  /** Logarithmic control (for doping, currents, etc.). */
  readonly logScale?: boolean;
}

export interface EnumParameter {
  readonly type: 'enum';
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly default: string;
}

/** A concrete set of parameter values, keyed by descriptor key (SI units). */
export type ParameterValues = Readonly<Record<string, number | string>>;

/** A full schema: an ordered, optionally grouped list of descriptors. */
export interface ParameterSchema {
  readonly groups: ReadonlyArray<ParameterGroup>;
}

export interface ParameterGroup {
  readonly title: string;
  readonly parameters: ReadonlyArray<ParameterDescriptor>;
}

/** Validate + clamp a raw value against its descriptor. */
export function clampParameter(descriptor: ParameterDescriptor, raw: number | string): number | string {
  if (descriptor.kind.type === 'continuous') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return descriptor.kind.default;
    return Math.min(descriptor.kind.max, Math.max(descriptor.kind.min, n));
  }
  const valid = descriptor.kind.options.some((o) => o.value === raw);
  return valid ? raw : descriptor.kind.default;
}

/** Build the default value record from a schema. */
export function defaultValues(schema: ParameterSchema): ParameterValues {
  const out: Record<string, number | string> = {};
  for (const group of schema.groups) {
    for (const p of group.parameters) {
      out[p.key] = p.kind.type === 'continuous' ? p.kind.default : p.kind.default;
    }
  }
  return out;
}
