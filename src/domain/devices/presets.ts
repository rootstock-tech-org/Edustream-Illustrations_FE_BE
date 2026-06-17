import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { PARAM } from './shared';

/**
 * Technology presets are DATA, not behavior. Selecting one writes the standard
 * parameter values and the normal simulation pipeline produces every number —
 * nothing about the outcome is hardcoded. Values stay within the schema bounds.
 */
export interface DevicePreset {
  readonly id: string;
  readonly name: string;
  readonly node: string;
  readonly description: string;
  /** Short behavioral tags shown on the card (qualitative framing only). */
  readonly tags: readonly string[];
  readonly values: ParameterValues;
}

const base = {
  [PARAM.Vin]: 0.9,
  [PARAM.Na]: 1e23,
} as const;

export const PRESETS: readonly DevicePreset[] = [
  {
    id: '90nm',
    name: '90 nm Process',
    node: '90 nm',
    description: 'An early-2000s bulk CMOS node — relaxed geometry, higher supply.',
    tags: ['balanced', 'higher VDD'],
    values: { ...base, [PARAM.L]: 90e-9, [PARAM.W]: 1e-6, [PARAM.Tox]: 2.2e-9, [PARAM.Vth]: 0.35, [PARAM.VDD]: 1.2, [PARAM.Cload]: 10e-15, [PARAM.Temperature]: 300, [PARAM.Corner]: 'TT', [PARAM.Vin]: 0.6 },
  },
  {
    id: '45nm',
    name: '45 nm Process',
    node: '45 nm',
    description: 'Scaled node — thinner oxide, lower supply, faster but leakier.',
    tags: ['faster', 'thin oxide'],
    values: { ...base, [PARAM.L]: 45e-9, [PARAM.W]: 0.6e-6, [PARAM.Tox]: 1.4e-9, [PARAM.Vth]: 0.3, [PARAM.VDD]: 1.0, [PARAM.Cload]: 6e-15, [PARAM.Temperature]: 300, [PARAM.Corner]: 'TT', [PARAM.Vin]: 0.5 },
  },
  {
    id: 'hp-cpu',
    name: 'High-Performance CPU',
    node: '45 nm · FF',
    description: 'Speed-first: wide devices, low Vth, fast corner, higher supply.',
    tags: ['max speed', 'high power'],
    values: { ...base, [PARAM.L]: 45e-9, [PARAM.W]: 2.5e-6, [PARAM.Tox]: 1.4e-9, [PARAM.Vth]: 0.25, [PARAM.VDD]: 1.2, [PARAM.Cload]: 8e-15, [PARAM.Temperature]: 350, [PARAM.Corner]: 'FF', [PARAM.Vin]: 0.6 },
  },
  {
    id: 'mobile-lp',
    name: 'Mobile Low-Power',
    node: '90 nm · SS',
    description: 'Battery-first: high Vth, low supply, slow corner to suppress leakage.',
    tags: ['low leakage', 'low VDD'],
    values: { ...base, [PARAM.L]: 90e-9, [PARAM.W]: 0.5e-6, [PARAM.Tox]: 2.5e-9, [PARAM.Vth]: 0.5, [PARAM.VDD]: 0.9, [PARAM.Cload]: 15e-15, [PARAM.Temperature]: 300, [PARAM.Corner]: 'SS', [PARAM.Vin]: 0.45 },
  },
  {
    id: 'leakage-opt',
    name: 'Leakage-Optimized',
    node: '180 nm · SS',
    description: 'Standby-first: long channel and high Vth crush subthreshold leakage.',
    tags: ['min leakage', 'long L'],
    values: { ...base, [PARAM.L]: 180e-9, [PARAM.W]: 0.6e-6, [PARAM.Tox]: 3e-9, [PARAM.Vth]: 0.55, [PARAM.VDD]: 1.0, [PARAM.Cload]: 10e-15, [PARAM.Temperature]: 300, [PARAM.Corner]: 'SS', [PARAM.Vin]: 0.5 },
  },
  {
    id: 'perf-opt',
    name: 'Performance-Optimized',
    node: '45 nm · FF',
    description: 'Latency-first: very wide, very low Vth, high supply — fast and hungry.',
    tags: ['min delay', 'leaky'],
    values: { ...base, [PARAM.L]: 45e-9, [PARAM.W]: 3e-6, [PARAM.Tox]: 1.4e-9, [PARAM.Vth]: 0.25, [PARAM.VDD]: 1.3, [PARAM.Cload]: 8e-15, [PARAM.Temperature]: 300, [PARAM.Corner]: 'FF', [PARAM.Vin]: 0.65 },
  },
];

export const listPresets = (): readonly DevicePreset[] => PRESETS;
