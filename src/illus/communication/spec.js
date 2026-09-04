/*
 * Communication — AssetSpec (Rulebook §4, networks discipline; house convention).
 */
import { NAMEPLATE, MODEL } from './model.js';

export const COMM_SPEC = {
  id: 'telemetry-path',
  name: 'Telemetry network path',
  discipline: 'networks',
  standard: 'House convention (see legend) · M/M/1 queueing',
  view: 'topology',
  depth: 3,

  quantities: [
    { key: 'throughput', tag: 'THR', label: 'Goodput', unit: 'bit/s', display: { symbol: 'Mbps', scale: 1e-6 }, range: [0, 12], sigFigs: 3, anchor: 'link', formulaId: 'thr' },
    { key: 'latency', tag: 'LAT', label: 'Latency', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 120], sigFigs: 3, anchor: 'link', limits: { hi: 0.05, hiHi: 0.1 }, formulaId: 'lat' },
    { key: 'loss', tag: 'LOSS', label: 'Packet loss', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 20], sigFigs: 2, anchor: 'link', limits: { hi: 0.01, hiHi: 0.05 }, formulaId: 'loss' },
    { key: 'util', tag: 'UTIL', label: 'Link utilisation', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 2, anchor: 'link', limits: { hi: 0.85, hiHi: 0.95 }, formulaId: 'util' },
  ],

  parameters: [
    { key: 'rate', label: 'Message rate', symbol: 'λ', unit: 'msg/s', min: 0, max: 3000, step: 50, nameplate: NAMEPLATE.rate },
    { key: 'payload', label: 'Payload', symbol: 'B', unit: 'bytes', min: 16, max: 1500, step: 16, nameplate: NAMEPLATE.payload },
    { key: 'bandwidth', label: 'Link bandwidth', symbol: 'C', unit: 'Mbps', min: 1, max: 100, step: 1, nameplate: NAMEPLATE.bandwidth },
  ],

  faults: [
    { id: 'congestion', label: 'Traffic burst / congestion', description: 'Offered load rises 60%. As utilisation passes ~85% latency climbs steeply and packets start to drop.', affects: ['latency', 'loss', 'util'] },
    { id: 'linkDegraded', label: 'Link degraded (retrains low)', description: 'Bandwidth falls to 35%. Same traffic now saturates the link — the insidious cause of "random" latency spikes.', affects: ['latency', 'loss', 'util'] },
  ],

  assumptions: [
    'Single bottleneck link with an M/M/1 queue.',
    'Uniform frame size; fixed per-hop propagation delay.',
    'Loss appears only as the link approaches saturation.',
  ],
  notModelled: ['TCP retransmission and windowing', 'Protocol overhead (headers, ACKs)', 'Jitter distribution', 'Wireless fading / interference'],
  model: MODEL,
};
