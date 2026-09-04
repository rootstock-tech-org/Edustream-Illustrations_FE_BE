/*
 * Capstone — AssetSpec (Rulebook §4). Integrated production line, OEE headline.
 */
import { NAMEPLATE, MODEL } from './model.js';

export const CAPSTONE_SPEC = {
  id: 'line-oee',
  name: 'Integrated line — OEE',
  discipline: 'systems',
  standard: 'SEMI E10 / OEE (A×P×Q)',
  view: 'pipeline',
  depth: 3,

  quantities: [
    { key: 'oee', tag: 'OEE', label: 'OEE', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'line', limits: { lo: 0.6, loLo: 0.4 }, formulaId: 'oee' },
    { key: 'avail', tag: 'AVL', label: 'Availability', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'line', limits: { lo: 0.8, loLo: 0.6 }, formulaId: 'avail' },
    { key: 'perf', tag: 'PRF', label: 'Performance', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'line', limits: { lo: 0.8, loLo: 0.6 }, formulaId: 'perf' },
    { key: 'qual', tag: 'QLT', label: 'Quality', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'line', limits: { lo: 0.95, loLo: 0.9 }, formulaId: 'qual' },
    { key: 'thru', tag: 'THRU', label: 'Good throughput', unit: 'units/h', display: { symbol: 'u/h' }, range: [0, 120], sigFigs: 3, anchor: 'line', formulaId: 'thru' },
  ],

  parameters: [
    { key: 'cycleTime', label: 'Cycle time', symbol: 'c', unit: 's', min: 20, max: 60, step: 1, nameplate: NAMEPLATE.cycleTime },
    { key: 'plannedDowntime', label: 'Downtime / shift', symbol: 'D', unit: 'min', min: 0, max: 240, step: 5, nameplate: NAMEPLATE.plannedDowntime },
    { key: 'scrapRate', label: 'Scrap rate', symbol: 's', unit: '%', min: 0, max: 30, step: 0.5, nameplate: NAMEPLATE.scrapRate },
  ],

  faults: [
    { id: 'breakdown', label: 'Unplanned breakdown', description: 'A 2-hour breakdown adds to downtime — availability drops and drags OEE with it.', affects: ['avail', 'oee'] },
    { id: 'microstops', label: 'Microstops / slow running', description: 'The cycle stretches by 6 s. Performance falls; the line looks busy but under-produces.', affects: ['perf', 'thru'] },
    { id: 'qualitySpill', label: 'Quality spill', description: 'Scrap climbs 8%. Good throughput and quality both take the hit.', affects: ['qual', 'thru'] },
  ],

  assumptions: [
    'Shift-average OEE model, not an event-level simulation.',
    'World-class OEE is around 85%.',
    'Downtime lumps planned and unplanned stops.',
  ],
  notModelled: ['Buffer / WIP dynamics between stations', 'Changeover and setup optimisation', 'Individual station bottleneck analysis'],
  model: MODEL,
};
