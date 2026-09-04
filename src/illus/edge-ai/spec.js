/*
 * Edge AI — AssetSpec (Rulebook §4, automation/dataflow; house convention).
 */
import { NAMEPLATE, MODEL } from './model.js';

export const EDGE_SPEC = {
  id: 'edge-inference',
  name: 'Edge inference pipeline',
  discipline: 'automation',
  standard: 'Dataflow (see legend)',
  view: 'block',
  depth: 3,

  quantities: [
    { key: 'latency', tag: 'LAT', label: 'Inference latency', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 200], sigFigs: 3, anchor: 'infer', limits: { hi: 0.05, hiHi: 0.1 }, formulaId: 'lat' },
    { key: 'fps', tag: 'FPS', label: 'Frame rate', unit: '1/s', display: { symbol: 'fps', scale: 1 }, range: [0, 120], sigFigs: 3, anchor: 'infer', limits: { lo: 15 }, formulaId: 'fps' },
    { key: 'accuracy', tag: 'ACC', label: 'Accuracy', unit: '1', display: { symbol: '%', scale: 100 }, range: [40, 100], sigFigs: 3, anchor: 'infer', limits: { lo: 0.75 }, formulaId: 'acc' },
    { key: 'power', tag: 'PWR', label: 'Compute power', unit: 'W', display: { symbol: 'W', scale: 1 }, range: [0, 25], sigFigs: 2, anchor: 'infer', limits: { hi: 15, hiHi: 20 }, formulaId: 'pwr' },
  ],

  parameters: [
    { key: 'modelM', label: 'Model size', symbol: 'M', unit: 'M params', min: 1, max: 200, step: 1, nameplate: NAMEPLATE.modelM },
    { key: 'res', label: 'Input resolution', symbol: 'r', unit: 'px', min: 96, max: 640, step: 16, nameplate: NAMEPLATE.res },
    { key: 'tops', label: 'Compute', symbol: 'TOPS', unit: 'TOPS', min: 1, max: 40, step: 1, nameplate: NAMEPLATE.tops },
  ],

  faults: [
    { id: 'thermalThrottle', label: 'Thermal throttle', description: 'The accelerator clocks down to 55% under heat — latency rises and FPS drops even though the model is unchanged.', affects: ['latency', 'fps'] },
    { id: 'memoryLimit', label: 'Model exceeds memory', description: 'A large model spills to slow memory (×3.2 latency). The insidious cost of oversizing a model for the edge.', affects: ['latency', 'fps'] },
  ],

  assumptions: [
    'Compute-bound latency; memory bandwidth not fully modelled.',
    'Accuracy follows an indicative size curve for one task/dataset.',
    'Single-stream inference, no batching.',
  ],
  notModelled: ['Quantisation / pruning effects in detail', 'Camera capture and I/O latency', 'Accuracy per class / dataset shift'],
  model: MODEL,
};
