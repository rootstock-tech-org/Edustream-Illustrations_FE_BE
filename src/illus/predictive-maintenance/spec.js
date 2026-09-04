/*
 * Predictive Maintenance — AssetSpec (Rulebook §4, mechanical/condition monitoring).
 */
import { NAMEPLATE, ZONES, MODEL } from './model.js';
const K = 273.15;

export const PM_SPEC = {
  id: 'bearing-rul',
  name: 'Bearing condition & RUL',
  discipline: 'mechanical',
  standard: 'ISO 10816/20816 + ISO 13374',
  view: 'section',
  depth: 3,

  quantities: [
    { key: 'vib', tag: 'VE-201', label: 'Vibration', unit: 'm/s', display: { symbol: 'mm/s', scale: 1000 }, range: [0, 12], sigFigs: 2, anchor: 'bearing', limits: { hi: ZONES.alarm / 1000, hiHi: ZONES.danger / 1000 }, formulaId: 'vib' },
    { key: 'temp', tag: 'TE-202', label: 'Bearing temp', unit: 'K', display: { symbol: '°C', scale: 1, offset: -K }, range: [20, 120], sigFigs: 3, anchor: 'bearing', limits: { hi: 80 + K, hiHi: 100 + K }, formulaId: 'temp' },
    { key: 'rul', tag: 'RUL', label: 'Remaining life', unit: 's', display: { symbol: 'h', scale: 1 / 3600 }, range: [0, 4000], sigFigs: 3, anchor: 'bearing', limits: { lo: 500 * 3600, loLo: 100 * 3600 }, formulaId: 'rul' },
    { key: 'crest', tag: 'CF-203', label: 'Crest factor', unit: '1', display: { symbol: '×', scale: 1 }, range: [1, 6], sigFigs: 2, anchor: 'bearing', limits: { hi: 3.5, hiHi: 5 }, formulaId: 'crest' },
  ],

  parameters: [
    { key: 'load', label: 'Load', symbol: 'L', unit: '%', min: 0, max: 120, step: 5, nameplate: NAMEPLATE.load },
    { key: 'rpm', label: 'Speed', symbol: 'n', unit: 'rpm', min: 0, max: 1800, step: 50, nameplate: NAMEPLATE.rpm },
    { key: 'health', label: 'Bearing health', symbol: 'H', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.health },
  ],

  faults: [
    { id: 'lubeLoss', label: 'Lubrication loss', description: 'Insidious: bearing temperature climbs and vibration rises together — RUL collapses faster than health alone suggests.', affects: ['temp', 'vib', 'rul'] },
    { id: 'imbalance', label: 'Rotor imbalance', description: 'Raises 1× running-speed vibration; grows with speed.', affects: ['vib'] },
    { id: 'misalign', label: 'Shaft misalignment', description: 'Adds vibration (typically 2× line) and load on the bearing.', affects: ['vib'] },
  ],

  assumptions: [
    'Overall velocity RMS only — no frequency spectrum (FFT) is modelled.',
    'RUL is a linear extrapolation of the current degradation rate, not a guarantee.',
    'Lumped bearing temperature; steady operating point.',
  ],
  notModelled: ['Bearing defect frequencies (BPFO/BPFI/BSF)', 'Oil analysis / wear debris', 'Load spectrum and duty cycle history'],
  model: MODEL,
};
