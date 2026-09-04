/*
 * Digital Twin — pure model (Rulebook §2.1, §2.2). A physical asset and its live
 * twin model of the same quantity. The twin PREDICTS; the (simulated) measurement
 * may drift from it. Deviation and sync confidence expose when the twin is out of
 * step with reality — the whole point of a twin. Deterministic, no Math.random.
 */
export const NAMEPLATE = { load: 60, ambient: 25, coolant: 40 };

export function evaluate(params, faults = {}) {
  const load = clamp(params.load, 0, 120);
  const ambient = clamp(params.ambient, -10, 60);
  const coolant = clamp(params.coolant, 0, 100);

  // Twin prediction of asset temperature (the model of record).
  const predicted = ambient + 0.6 * load - 0.3 * coolant;
  // Simulated field measurement: prediction + sensor drift + unmodelled wear.
  const drift = faults.sensorDrift ? 9 : 0;
  const wear = faults.unmodeledWear ? 0.25 * load : 0;
  const measured = predicted + drift + wear;

  const deviation = measured - predicted;
  const confidence = clamp(100 - Math.abs(deviation) * 7, 0, 100);

  const mkT = (id, title, v, note) => ({
    si: v + 273.15, unit: 'K',
    explanation: { formulaId: id, title, latex: 'T = T_{amb} + 0.6L - 0.3C', steps: [['ambient', `${ambient} °C`], ['+0.6·load', `${(0.6 * load).toFixed(1)}`], ['-0.3·coolant', `${(-0.3 * coolant).toFixed(1)}`], [note || 'T', `${v.toFixed(1)} °C`]], result: `${v.toFixed(1)} °C`, assumptions: ['Lumped first-order thermal model.', 'Twin and asset share the same nominal model.'] },
  });

  return {
    predicted: mkT('pred', 'Twin prediction', predicted),
    measured: {
      si: measured + 273.15, unit: 'K',
      explanation: { formulaId: 'meas', title: 'Measured (simulated)', latex: 'T_{meas} = T_{pred} + \\text{drift} + \\text{wear}', steps: [['prediction', `${predicted.toFixed(1)} °C`], ['sensor drift', drift ? `+${drift} °C` : '0'], ['unmodelled wear', wear ? `+${wear.toFixed(1)} °C` : '0'], ['measured', `${measured.toFixed(1)} °C`]], result: `${measured.toFixed(1)} °C`, assumptions: ['A simulated measurement — NOT a real sensor yet.', 'When a real sensor lands, this quantity flips source model→sensor (§2.2).'] },
    },
    deviation: {
      si: deviation, unit: 'K',
      explanation: { formulaId: 'dev', title: 'Twin deviation', latex: '\\Delta = T_{meas} - T_{pred}', steps: [['measured', `${measured.toFixed(1)} °C`], ['predicted', `${predicted.toFixed(1)} °C`], ['deviation', `${deviation.toFixed(1)} K`]], result: `${deviation.toFixed(1)} K`, assumptions: ['Large deviation ⇒ the twin needs recalibration or a model update.'] },
    },
    confidence: {
      si: confidence / 100, unit: '1',
      explanation: { formulaId: 'conf', title: 'Sync confidence', latex: 'c = 100 - 7\\,|\\Delta|', steps: [['deviation', `${Math.abs(deviation).toFixed(1)} K`], ['confidence', `${confidence.toFixed(0)} %`]], result: `${confidence.toFixed(0)} %`, assumptions: ['Heuristic confidence from the live deviation.'] },
    },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'asset-digital-twin', version: '1.0' };
