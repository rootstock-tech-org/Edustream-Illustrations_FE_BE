/*
 * PLC & SCADA — AssetSpec (Illustration Rulebook §4, automation discipline).
 * IEC 61131-3 ladder view. The ladder geometry is laid out in the figure; this
 * spec carries the I/O quantities, operator parameters, faults, assumptions and
 * model identity that drive the panel and the acceptance gate.
 */
import { NAMEPLATE, ADDR, MODEL } from './model.js';

export const PLC_SPEC = {
  id: 'plc-tank-level',
  name: 'PLC tank-level control',
  discipline: 'automation',
  standard: 'IEC 61131-3 (Ladder)',
  view: 'ladder',
  depth: 3,

  // I/O the figure and port table display. Booleans are unit 'bool' (0/1).
  quantities: [
    { key: 'level', tag: ADDR.level, label: 'Tank level', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, limits: { hiHi: 0.95, lo: 0.05 }, formulaId: 'level' },
    { key: 'pump', tag: ADDR.pump, label: 'Pump coil', unit: 'bool', display: { symbol: '', scale: 1 }, range: [0, 1], sigFigs: 1, formulaId: 'pump-rung' },
    { key: 'valve', tag: ADDR.valve, label: 'Valve coil', unit: 'bool', display: { symbol: '', scale: 1 }, range: [0, 1], sigFigs: 1, formulaId: 'valve' },
    { key: 'scan', tag: 'SCAN', label: 'Scan time', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 50], sigFigs: 2, formulaId: 'scan' },
  ],

  // Numeric operator setpoints (the sliders). run/mode/manualPump are switches in the twin.
  parameters: [
    { key: 'lowSP', label: 'Low setpoint', symbol: 'L_low', unit: '%', min: 5, max: 60, step: 5, nameplate: NAMEPLATE.lowSP },
    { key: 'highSP', label: 'High setpoint', symbol: 'L_high', unit: '%', min: 40, max: 95, step: 5, nameplate: NAMEPLATE.highSP },
    { key: 'demand', label: 'Outflow demand', symbol: 'D', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.demand },
  ],

  faults: [
    { id: 'weldedPump', label: 'Pump contactor welded', description: 'Insidious: the coil de-energises in logic but the physical pump keeps running — the level climbs past HIGH toward overflow even though the ladder says "off".', affects: ['pump', 'level'] },
    { id: 'stuckLow', label: 'Low-level sensor stuck ON', description: 'The LvlLow contact reads TRUE forever, so the seal-in never releases at the high setpoint — the tank overfills.', affects: ['level'] },
  ],

  assumptions: [
    'One rung solved per scan on a stable input snapshot (read → solve → write).',
    'First-order tank; linear inflow/outflow, no valve stroke time or sensor lag.',
    'Seal-in latch provides the on/off hysteresis between the setpoints.',
  ],
  notModelled: ['Analog PID control', 'Communication / SCADA network latency', 'Pump curve and head', 'Sensor noise and calibration drift'],

  model: MODEL,
};
