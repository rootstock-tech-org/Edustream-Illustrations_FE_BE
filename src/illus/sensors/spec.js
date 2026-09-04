/*
 * Sensors — AssetSpec (Illustration Rulebook §4). Pure data: no React, no imports
 * from the figure. Ports are declared before links; every link terminates at a
 * declared port (§5.6). Coordinates are grid-snapped (multiples of 4 du, §6.2) on
 * the 960×600 figure canvas with a 160 du callout gutter reserved on the right.
 *
 * Discipline: process. Standard: ISA-5.1 (instrumentation) + ISO 10628 (flow).
 * Tags follow ISA-5.1 loop convention (§2.6): TT/VT/FT/IT-1xx.
 */
import { NAMEPLATE, MODEL } from './model.js';

const K = 273.15;

export const SENSORS_SPEC = {
  id: 'motor-pump-instrumented',
  name: 'Instrumented motor–pump set',
  discipline: 'process',
  standard: 'ISA-5.1 + ISO 10628',
  view: 'p&id',
  depth: 3,

  // --- components (symbol = key into the process symbol library, §15) ---------
  components: [
    { id: 'M1', symbol: 'motor', label: 'Drive motor', at: [240, 336], ports: ['M1.supply', 'M1.shaft', 'M1.winding', 'M1.bearing'], nameplate: { Power: '7.5 kW', Speed: '1500 rpm', Current: '18 A', Insulation: 'Class F' } },
    { id: 'P-101', symbol: 'pump', label: 'Recirc pump', at: [472, 336], ports: ['P-101.drive', 'P-101.suction', 'P-101.discharge'], nameplate: { Type: 'Centrifugal', BEP: '42 m³/h', Head: '32 m' } },
    { id: 'TT-101', symbol: 'instrument', label: 'Winding temp (RTD PT100)', at: [240, 196], ports: ['TT-101.sig'], nameplate: { Element: 'PT100', Std: 'IEC 60751', Range: '0–150 °C' } },
    { id: 'VT-102', symbol: 'instrument', label: 'Bearing vibration', at: [360, 472], ports: ['VT-102.sig'], nameplate: { Element: 'Accelerometer', Std: 'ISO 10816/20816' } },
    { id: 'FT-103', symbol: 'instrument', label: 'Discharge flow', at: [620, 196], ports: ['FT-103.sig'], nameplate: { Element: 'Electromagnetic', Range: '0–70 m³/h' } },
    { id: 'IT-104', symbol: 'instrument', label: 'Motor line current', at: [128, 220], ports: ['IT-104.sig'], nameplate: { Element: 'Current transformer', Range: '0–25 A' } },
  ],

  // --- ports (id, label, at [x,y], medium, direction) -------------------------
  ports: [
    { id: 'M1.supply', label: 'Supply', at: [216, 336], medium: 'electrical', direction: 'in' },
    { id: 'M1.shaft', label: 'Shaft', at: [264, 336], medium: 'mechanical', direction: 'out' },
    { id: 'M1.winding', label: 'Winding', at: [240, 312], medium: 'thermal', direction: 'out' },
    { id: 'M1.bearing', label: 'DE bearing', at: [360, 352], medium: 'mechanical', direction: 'out' },
    { id: 'P-101.drive', label: 'Drive', at: [448, 336], medium: 'mechanical', direction: 'in' },
    { id: 'P-101.suction', label: 'Suction', at: [472, 360], medium: 'liquid', direction: 'in' },
    { id: 'P-101.discharge', label: 'Discharge', at: [496, 336], medium: 'liquid', direction: 'out' },
    { id: 'TT-101.sig', label: 'TT signal', at: [240, 212], medium: 'signal', direction: 'out' },
    { id: 'VT-102.sig', label: 'VT signal', at: [360, 456], medium: 'signal', direction: 'out' },
    { id: 'FT-103.sig', label: 'FT signal', at: [620, 212], medium: 'signal', direction: 'out' },
    { id: 'IT-104.sig', label: 'IT signal', at: [128, 236], medium: 'signal', direction: 'out' },
    // system boundary ports (§5.6)
    { id: 'SUP', label: '3~ 400 V', at: [64, 336], medium: 'electrical', direction: 'in', boundary: true },
    { id: 'SUC', label: 'From tank', at: [472, 520], medium: 'liquid', direction: 'in', boundary: true },
    { id: 'DIS', label: 'To header', at: [720, 336], medium: 'liquid', direction: 'out', boundary: true },
  ],

  // --- links (from/to must be declared port ids; rank sets weight) ------------
  links: [
    { id: 'l-sup', from: 'SUP', to: 'M1.supply', medium: 'electrical', rank: 'primary' },
    { id: 'l-shaft', from: 'M1.shaft', to: 'P-101.drive', medium: 'mechanical', rank: 'primary' },
    { id: 'l-suc', from: 'SUC', to: 'P-101.suction', medium: 'liquid', rank: 'primary' },
    { id: 'l-dis', from: 'P-101.discharge', to: 'DIS', medium: 'liquid', rank: 'primary', flowQuantity: 'flow' },
    { id: 'l-tt', from: 'M1.winding', to: 'TT-101.sig', medium: 'signal', rank: 'auxiliary' },
    { id: 'l-vt', from: 'M1.bearing', to: 'VT-102.sig', medium: 'signal', rank: 'auxiliary' },
    { id: 'l-ft', from: 'P-101.discharge', to: 'FT-103.sig', medium: 'signal', rank: 'auxiliary' },
    { id: 'l-it', from: 'M1.supply', to: 'IT-104.sig', medium: 'signal', rank: 'auxiliary' },
  ],

  // --- quantities (SI unit + display scale/offset + ISO/insulation limits) ----
  quantities: [
    { key: 'temp', tag: 'TT-101', label: 'Winding temp', unit: 'K', display: { symbol: '°C', scale: 1, offset: -K }, range: [0, 150], sigFigs: 3, anchor: 'M1', limits: { hi: 78 + K, hiHi: 95 + K }, formulaId: 'winding-temp' },
    { key: 'vib', tag: 'VT-102', label: 'Vibration', unit: 'm/s', display: { symbol: 'mm/s', scale: 1000 }, range: [0, 12], sigFigs: 2, anchor: 'M1.bearing', limits: { hi: 4.5e-3, hiHi: 7.1e-3 }, formulaId: 'vibration' },
    { key: 'flow', tag: 'FT-103', label: 'Discharge flow', unit: 'm3/s', display: { symbol: 'm³/h', scale: 3600 }, range: [0, 70], sigFigs: 2, anchor: 'l-dis', limits: { lo: 8 / 3600 }, formulaId: 'flow' },
    { key: 'current', tag: 'IT-104', label: 'Motor current', unit: 'A', display: { symbol: 'A', scale: 1 }, range: [0, 25], sigFigs: 3, anchor: 'M1.supply', limits: { hi: 16, hiHi: 19 }, formulaId: 'current' },
  ],

  // --- parameters (declarative schema → generates the control panel, §10.2) ---
  parameters: [
    { key: 'load', label: 'Load', symbol: 'load', unit: '%', min: 0, max: 120, step: 5, nameplate: NAMEPLATE.load },
    { key: 'rpm', label: 'Speed', symbol: 'n', unit: 'rpm', min: 0, max: 1800, step: 50, nameplate: NAMEPLATE.rpm },
    { key: 'ambient', label: 'Ambient', symbol: 'T_amb', unit: '°C', min: -10, max: 60, step: 1, nameplate: NAMEPLATE.ambient },
  ],

  // --- faults (≥2, ≥1 insidious). Applied in the model, never the render ------
  faults: [
    { id: 'bearingWear', label: 'DE bearing wear', description: 'Insidious: shows first as rising vibration and a small current rise — NOT as a flow alarm.', affects: ['VT-102', 'IT-104', 'M1.bearing'] },
    { id: 'coolingLoss', label: 'Cooling cowl blocked', description: 'Winding temperature climbs toward the Class F limit; flow and vibration unaffected.', affects: ['TT-101', 'M1'] },
  ],

  legend: [
    { swatch: 'line', token: 'liquid', label: 'Process liquid' },
    { swatch: 'line', token: 'electrical', label: 'Electrical power' },
    { swatch: 'line', token: 'signal', label: 'Instrument signal' },
    { swatch: 'line', token: 'mechanical', label: 'Mechanical (shaft)' },
    { swatch: 'state', token: 'warning', label: 'Approaching limit' },
    { swatch: 'state', token: 'fault', label: 'Fault / alarm' },
  ],

  assumptions: [
    'Steady state — the figure is still until a parameter changes.',
    'Single operating point; affinity law Q ∝ N with one fixed system curve.',
    'Lumped winding temperature (IEC 60034 rise), not a hot-spot model.',
    'Vibration is overall velocity RMS only — no FFT spectrum.',
  ],

  notModelled: ['Cavitation and NPSH margin', 'Bearing temperature', 'Transient surge / water hammer', 'Power factor and harmonics'],

  model: MODEL,
};
