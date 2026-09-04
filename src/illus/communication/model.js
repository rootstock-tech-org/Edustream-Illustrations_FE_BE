/*
 * Communication — pure model (Rulebook §2.1). An industrial telemetry path
 * Sensor → Gateway → Edge → Cloud. Deterministic queueing model: offered load,
 * link utilisation, latency (propagation + serialisation + M/M/1 queueing) and
 * packet loss near saturation. No Math.random / no wall-clock.
 */
export const NAMEPLATE = { rate: 200, payload: 256, bandwidth: 10 }; // msg/s, bytes, Mbps
export const HOPS = 3;
const PROP_MS_PER_HOP = 2;

export function evaluate(params, faults = {}) {
  const rate = clamp(params.rate, 0, 5000);
  const payload = clamp(params.payload, 16, 1500);
  const bwMbps = Math.max(0.1, clamp(params.bandwidth, 0.1, 100) * (faults.linkDegraded ? 0.35 : 1));

  const offeredBps = rate * payload * 8 * (faults.congestion ? 1.6 : 1);
  const capacityBps = bwMbps * 1e6;
  const util = clamp(offeredBps / capacityBps, 0, 0.999);

  const serMs = (payload * 8) / capacityBps * 1000; // serialisation of one frame
  const queueMs = (util / (1 - util)) * serMs; // M/M/1 mean wait
  const propMs = PROP_MS_PER_HOP * HOPS;
  const latencyMs = propMs + serMs + queueMs;

  const lossFrac = util > 0.85 ? Math.min(0.5, ((util - 0.85) / 0.15) ** 2 * 0.4) : 0;
  const goodputBps = Math.min(offeredBps, capacityBps) * (1 - lossFrac);

  return {
    throughput: {
      si: goodputBps, unit: 'bit/s',
      explanation: { formulaId: 'thr', title: 'Goodput', latex: 'G = \\min(\\text{offered}, C)\\,(1 - p_{loss})',
        steps: [['offered', `${(offeredBps / 1e6).toFixed(2)} Mbps`], ['capacity', `${bwMbps.toFixed(1)} Mbps`], ['loss', `${(lossFrac * 100).toFixed(1)} %`], ['goodput', `${(goodputBps / 1e6).toFixed(2)} Mbps`]],
        result: `${(goodputBps / 1e6).toFixed(2)} Mbps`, assumptions: ['Single bottleneck link.', 'Uniform frame size.'] },
    },
    latency: {
      si: latencyMs / 1000, unit: 's',
      explanation: { formulaId: 'lat', title: 'End-to-end latency', latex: 't = t_{prop} + t_{ser} + t_{queue},\\quad t_{queue} = \\frac{\\rho}{1-\\rho}t_{ser}',
        steps: [['propagation', `${propMs.toFixed(1)} ms (${HOPS} hops)`], ['serialisation', `${serMs.toFixed(2)} ms`], ['utilisation ρ', `${(util * 100).toFixed(0)} %`], ['queueing', `${queueMs.toFixed(2)} ms`], ['latency', `${latencyMs.toFixed(1)} ms`]],
        result: `${latencyMs.toFixed(1)} ms`, assumptions: ['M/M/1 queue at the bottleneck link.', 'Fixed per-hop propagation delay.'] },
    },
    loss: {
      si: lossFrac, unit: '1',
      explanation: { formulaId: 'loss', title: 'Packet loss', latex: 'p_{loss} = ((\\rho - 0.85)/0.15)^2 \\cdot 0.4',
        steps: [['utilisation ρ', `${(util * 100).toFixed(0)} %`], ['loss', `${(lossFrac * 100).toFixed(1)} %`]],
        result: `${(lossFrac * 100).toFixed(1)} %`, assumptions: ['Loss only appears as the link saturates (buffer overflow).'] },
    },
    util: {
      si: util, unit: '1',
      explanation: { formulaId: 'util', title: 'Link utilisation', latex: '\\rho = \\text{offered} / C',
        steps: [['offered', `${(offeredBps / 1e6).toFixed(2)} Mbps`], ['capacity', `${bwMbps.toFixed(1)} Mbps`], ['ρ', `${(util * 100).toFixed(0)} %`]],
        result: `${(util * 100).toFixed(0)} %`, assumptions: ['Load on the single bottleneck link.'] },
    },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'telemetry-path', version: '1.0' };
