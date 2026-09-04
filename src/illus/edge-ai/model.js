/*
 * Edge AI — pure model (Rulebook §2.1). An on-device inference pipeline
 * Capture → Preprocess → Infer → Act. Deterministic: given the model size, input
 * resolution and available compute, it returns inference latency, frame rate,
 * accuracy and power. No Math.random / no wall-clock.
 */
export const NAMEPLATE = { modelM: 25, res: 224, tops: 4 };

export function evaluate(params, faults = {}) {
  const modelM = clamp(params.modelM, 1, 300); // million parameters
  const res = clamp(params.res, 96, 640); // input side length (px)
  const tops = Math.max(0.2, clamp(params.tops, 0.2, 40) * (faults.thermalThrottle ? 0.55 : 1));

  const workload = modelM * (res / 224) ** 2; // relative compute units
  const paging = faults.memoryLimit && modelM > 40 ? 3.2 : 1; // model spills to slow memory
  const latencyMs = (0.9 * workload / tops) * paging + 2; // + fixed pipeline overhead
  const fps = 1000 / latencyMs;

  const resFactor = res >= 160 ? 1 : res / 160;
  const accPct = Math.min(95, (66 + 8.5 * Math.log2(modelM + 1)) * resFactor);
  const powerW = tops * 0.55 + 0.4;

  return {
    latency: { si: latencyMs / 1000, unit: 's',
      explanation: { formulaId: 'lat', title: 'Inference latency', latex: 't = 0.9\\,\\frac{M\\,(r/224)^2}{\\text{TOPS}}\\,k_{mem} + 2', steps: [['workload', `${workload.toFixed(1)} units`], ['compute', `${tops.toFixed(1)} TOPS`], ['memory factor', paging > 1 ? '×3.2 (paging)' : '×1'], ['latency', `${latencyMs.toFixed(1)} ms`]], result: `${latencyMs.toFixed(1)} ms`, assumptions: ['Compute-bound; roofline ignored.', 'Fixed 2 ms pipeline overhead.'] } },
    fps: { si: fps, unit: '1/s',
      explanation: { formulaId: 'fps', title: 'Frame rate', latex: 'FPS = 1000 / t', steps: [['latency', `${latencyMs.toFixed(1)} ms`], ['FPS', `${fps.toFixed(1)}`]], result: `${fps.toFixed(1)} fps`, assumptions: ['Single-stream, no batching.'] } },
    accuracy: { si: accPct / 100, unit: '1',
      explanation: { formulaId: 'acc', title: 'Model accuracy', latex: 'a = (66 + 8.5\\log_2(M+1))\\,k_{res}', steps: [['model size', `${modelM} M params`], ['resolution factor', resFactor.toFixed(2)], ['accuracy', `${accPct.toFixed(1)} %`]], result: `${accPct.toFixed(1)} %`, assumptions: ['Indicative accuracy–size curve, one task/dataset.', 'Low input resolution costs accuracy.'] } },
    power: { si: powerW, unit: 'W',
      explanation: { formulaId: 'pwr', title: 'Compute power', latex: 'P = 0.55\\,\\text{TOPS} + 0.4', steps: [['compute', `${tops.toFixed(1)} TOPS`], ['power', `${powerW.toFixed(2)} W`]], result: `${powerW.toFixed(2)} W`, assumptions: ['Linear power–compute approximation for the accelerator.'] } },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'edge-inference', version: '1.0' };
