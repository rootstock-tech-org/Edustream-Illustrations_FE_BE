/*
 * Digital Twin — AssetSpec (Rulebook §4, process/block). Demonstrates the
 * model↔sensor binding seam (§2.2): today all quantities are model-sourced, but
 * the "measured" one is the one that flips to a real sensor when the plant connects.
 */
import { NAMEPLATE, MODEL } from './model.js';
const K = 273.15;

export const DT_SPEC = {
  id: 'asset-digital-twin',
  name: 'Asset digital twin — predicted vs measured',
  discipline: 'process',
  standard: 'Twin (unsynced) · see §2.2 seam',
  view: 'block',
  depth: 3,

  quantities: [
    { key: 'predicted', tag: 'PRED', label: 'Twin prediction', unit: 'K', display: { symbol: '°C', scale: 1, offset: -K }, range: [0, 120], sigFigs: 3, anchor: 'twin', formulaId: 'pred' },
    { key: 'measured', tag: 'MEAS', label: 'Measured (sim)', unit: 'K', display: { symbol: '°C', scale: 1, offset: -K }, range: [0, 120], sigFigs: 3, anchor: 'asset', formulaId: 'meas' },
    { key: 'deviation', tag: 'DEV', label: 'Deviation', unit: 'K', display: { symbol: 'K', scale: 1 }, range: [0, 40], sigFigs: 2, anchor: 'twin', limits: { hi: 3, hiHi: 8 }, formulaId: 'dev' },
    { key: 'confidence', tag: 'CONF', label: 'Sync confidence', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'twin', limits: { lo: 0.7, loLo: 0.4 }, formulaId: 'conf' },
  ],

  parameters: [
    { key: 'load', label: 'Load', symbol: 'L', unit: '%', min: 0, max: 120, step: 5, nameplate: NAMEPLATE.load },
    { key: 'ambient', label: 'Ambient', symbol: 'T_amb', unit: '°C', min: -10, max: 60, step: 1, nameplate: NAMEPLATE.ambient },
    { key: 'coolant', label: 'Coolant', symbol: 'C', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.coolant },
  ],

  faults: [
    { id: 'sensorDrift', label: 'Sensor drift +9 °C', description: 'The measurement drifts above the twin. Deviation and confidence flag that the twin no longer matches reality — recalibrate the sensor.', affects: ['measured', 'deviation', 'confidence'] },
    { id: 'unmodeledWear', label: 'Unmodelled wear', description: 'The physical asset degrades in a way the twin model does not capture. Deviation grows with load — a signal the model needs updating.', affects: ['measured', 'deviation', 'confidence'] },
  ],

  assumptions: [
    'Twin and asset share the same nominal first-order thermal model.',
    'The "measured" value is simulated today; it flips to a real sensor at the §2.2 seam.',
    'Confidence is a heuristic of the live deviation.',
  ],
  notModelled: ['State estimation / Kalman filtering', 'Automatic model recalibration', 'Multi-variable twins'],
  model: MODEL,
};
