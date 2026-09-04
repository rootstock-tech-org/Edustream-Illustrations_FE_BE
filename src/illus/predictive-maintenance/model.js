/*
 * Predictive Maintenance — pure model (Rulebook §2.1). A rolling-element bearing
 * degrading under load. Deterministic: given the operating point and the bearing
 * health, it returns vibration (ISO 10816 velocity RMS), bearing temperature and
 * an estimated Remaining Useful Life (RUL). No Math.random / no wall-clock.
 */
export const NAMEPLATE = { load: 70, rpm: 1500, health: 100 };

// ISO 10816/20816 medium-machine velocity zones (mm/s RMS).
export const ZONES = { good: 2.8, alarm: 4.5, danger: 7.1 };
const VIB_FAIL = 11.0; // functional failure threshold (mm/s)

export function evaluate(params, faults = {}) {
  const load = clamp(params.load, 0, 120) / 100;
  const r = clamp(params.rpm, 0, 1800) / NAMEPLATE.rpm;
  const health = clamp(params.health, 0, 100) / 100; // 1 = new, 0 = failed
  const defect = 1 - health; // 0..1 severity

  const lub = faults.lubeLoss ? 1 : 0;
  const imb = faults.imbalance ? 1 : 0;
  const mis = faults.misalign ? 1 : 0;

  // Vibration RMS: residual + speed imbalance + defect growth + fault terms.
  const vibResidual = 0.8 * r * r;
  const vibDefect = 6.0 * defect * defect + 1.5 * defect; // accelerates near failure
  const vibMm = vibResidual + 0.5 * load + vibDefect + imb * 2.2 * r + mis * 1.8 + lub * 1.2;

  // Bearing temperature: ambient + friction (rises with load, defect, lube loss).
  const tempC = 30 + 22 * load + 18 * defect + lub * 25;

  // Crest factor (peak/RMS): a classic bearing-defect indicator. A healthy
  // bearing runs near the sinusoidal 1.41; spalling adds sharp impacts that lift
  // the peak far more than the RMS, so the ratio climbs before the RMS alarm.
  const crest = 1.41 + 3.4 * defect * defect + 0.6 * defect + imb * 0.25 + mis * 0.35 + lub * 0.5;

  // RUL: hours until vibration reaches the failure threshold, from the current
  // degradation rate (∝ severity and load). Floors at 0 when already failed.
  const degRatePerH = 0.004 * (0.3 + defect) * (0.5 + load) * (1 + 0.6 * lub); // mm/s per hour
  const rulH = degRatePerH <= 0 ? Infinity : Math.max(0, (VIB_FAIL - vibMm) / degRatePerH);

  return {
    vib: {
      si: vibMm / 1000, unit: 'm/s',
      explanation: {
        formulaId: 'vib', title: 'Vibration (velocity RMS)',
        latex: 'v = v_{res}\\,r^2 + 0.5\\,L + v_{defect} + v_{fault}',
        steps: [
          ['r = rpm/rpm_n', r.toFixed(2)],
          ['v_res·r²', `${vibResidual.toFixed(2)} mm/s`],
          ['defect term', `${vibDefect.toFixed(2)} mm/s`],
          ['fault terms', `${(imb * 2.2 * r + mis * 1.8 + lub * 1.2).toFixed(2)} mm/s`],
          ['v', `${vibMm.toFixed(1)} mm/s RMS`],
        ],
        result: `${vibMm.toFixed(1)} mm/s`,
        assumptions: ['Overall velocity RMS only, no FFT bands.', 'ISO 10816 zones: good <2.8, alarm 4.5, danger >7.1 mm/s.'],
      },
    },
    temp: {
      si: tempC + 273.15, unit: 'K',
      explanation: {
        formulaId: 'temp', title: 'Bearing temperature',
        latex: 'T = T_{amb} + 22\\,L + 18\\,d + T_{lube}',
        steps: [['load L', load.toFixed(2)], ['defect d', defect.toFixed(2)], ['lube loss', lub ? '+25 °C' : '0'], ['T', `${tempC.toFixed(0)} °C`]],
        result: `${tempC.toFixed(0)} °C`,
        assumptions: ['Lumped bearing temperature.', 'Steady-state; no thermal transient.'],
      },
    },
    rul: {
      si: Number.isFinite(rulH) ? rulH * 3600 : 1e12, unit: 's',
      explanation: {
        formulaId: 'rul', title: 'Remaining useful life',
        latex: 'RUL = (v_{fail} - v) / \\dot{v}',
        steps: [['v_fail', `${VIB_FAIL} mm/s`], ['v now', `${vibMm.toFixed(1)} mm/s`], ['degradation', `${(degRatePerH * 1000).toFixed(2)} µm/s per h`], ['RUL', Number.isFinite(rulH) ? `${Math.round(rulH)} h` : '—']],
        result: Number.isFinite(rulH) ? `${Math.round(rulH)} h` : '—',
        assumptions: ['Linear degradation extrapolation from the current rate.', 'RUL is an estimate, not a guarantee; re-assess as condition changes.'],
      },
    },
    crest: {
      si: crest, unit: '1',
      explanation: {
        formulaId: 'crest', title: 'Crest factor (peak/RMS)',
        latex: 'CF = A_{peak} / A_{rms}',
        steps: [['healthy baseline', '1.41 (sinusoid)'], ['defect d', defect.toFixed(2)], ['fault terms', `${(imb * 0.25 + mis * 0.35 + lub * 0.5).toFixed(2)}`], ['CF', crest.toFixed(2)]],
        result: crest.toFixed(2),
        assumptions: ['Impulsive defects lift the peak faster than the RMS.', 'Rises before the RMS velocity alarm - an early indicator.'],
      },
    },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'bearing-rul', version: '1.0' };
