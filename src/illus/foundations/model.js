/*
 * Foundations — pure model (Rulebook §2.1). The four-layer IoT/IIoT stack
 * (Sensing → Network → Data Processing → Application) as an end-to-end latency
 * budget. Each layer adds a modelled delay; congestion and processing load add
 * queueing. Deterministic — no Math.random / no wall-clock.
 */
export const NAMEPLATE = { rate: 300, bandwidth: 20, procLoad: 40 };
export const PAYLOAD = 256; // bytes per message (fixed for this budget)

// Fixed per-layer base latencies (ms).
export const BASE = { sensing: 2, network: 3, processing: 14, application: 8 };

export function evaluate(params, faults = {}) {
  const rate = clamp(params.rate, 0, 5000);
  const bw = Math.max(0.1, clamp(params.bandwidth, 0.1, 100) * (faults.netCongestion ? 0.4 : 1));
  const load = clamp(params.procLoad + (faults.procOverload ? 45 : 0), 0, 99) / 100;

  const serMs = (PAYLOAD * 8) / (bw * 1e6) * 1000;
  const netUtil = clamp((rate * PAYLOAD * 8) / (bw * 1e6), 0, 0.999);
  const netMs = BASE.network + serMs + (netUtil / (1 - netUtil)) * serMs;
  const procMs = BASE.processing + (load / (1 - load)) * BASE.processing;
  const e2eMs = BASE.sensing + netMs + procMs + BASE.application;
  const thr = Math.min(rate, (bw * 1e6) / (PAYLOAD * 8));

  const mk = (id, title, ms, extra) => ({
    si: ms / 1000, unit: 's',
    explanation: { formulaId: id, title, latex: '', steps: extra, result: `${ms.toFixed(1)} ms`, assumptions: ['Fixed 256-byte messages.', 'Layer budgets are indicative, from the IIoT reference stack.'] },
  });

  return {
    e2e: mk('e2e', 'End-to-end latency', e2eMs, [
      ['Sensing', `${BASE.sensing} ms`], ['Network', `${netMs.toFixed(1)} ms`], ['Processing', `${procMs.toFixed(1)} ms`], ['Application', `${BASE.application} ms`], ['Total', `${e2eMs.toFixed(1)} ms`],
    ]),
    network: mk('network', 'Network latency', netMs, [['base+serialisation', `${(BASE.network + serMs).toFixed(2)} ms`], ['utilisation', `${(netUtil * 100).toFixed(0)} %`], ['queueing', `${((netUtil / (1 - netUtil)) * serMs).toFixed(2)} ms`]]),
    processing: mk('processing', 'Processing latency', procMs, [['base', `${BASE.processing} ms`], ['load', `${(load * 100).toFixed(0)} %`], ['queueing', `${((load / (1 - load)) * BASE.processing).toFixed(1)} ms`]]),
    throughput: {
      si: thr, unit: '1/s',
      explanation: { formulaId: 'thr', title: 'Throughput', latex: 'T = \\min(\\lambda,\\; C / (8B))', steps: [['offered λ', `${rate} msg/s`], ['link capacity', `${(bw * 1e6 / (PAYLOAD * 8)).toFixed(0)} msg/s`], ['throughput', `${thr.toFixed(0)} msg/s`]], result: `${thr.toFixed(0)} msg/s`, assumptions: ['Bottlenecked by the network link.'] },
    },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'iiot-stack-latency', version: '1.0' };
