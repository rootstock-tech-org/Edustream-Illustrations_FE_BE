/*
 * Sensors — pure behavioural model (Illustration Rulebook §2.1 MODEL layer).
 * Framework-free, deterministic: f(params) -> state. No React, no DOM, and NO
 * Math.random / Date.now (§2.3). Values are stored in SI base units; the spec
 * carries the display scale (§2.2). Every quantity emits an Explanation tree so
 * the derivation shown on click can never drift from the number used (§10.3).
 *
 * Machine: a TEFC induction motor driving a centrifugal pump on a recirculation
 * loop. Four field instruments read winding temperature, bearing vibration,
 * discharge flow and motor line current.
 */

// As-designed nameplate operating point. One source; the "reset to nameplate"
// control and the slider ticks both read from here (§10.2).
export const NAMEPLATE = {
  rpm: 1500, // rated speed (4-pole, 50 Hz)
  load: 75, // % rated torque at the design duty point
  ambient: 25, // °C design ambient
  tempRiseFull: 70, // K winding rise at 100% load (Class F margin)
  iNoLoad: 2.0, // A magnetising current
  iFull: 18.0, // A full-load line current
  flowBep: 42, // m3/h best-efficiency flow at rated speed
  vibResidual: 0.8, // mm/s RMS residual (balanced, ISO 10816 Zone A)
};

const K = 273.15;

/**
 * Evaluate the whole machine at one steady operating point.
 * @param {{load:number, rpm:number, ambient:number}} params  load %, speed rpm, ambient °C
 * @param {{bearingWear?:boolean, coolingLoss?:boolean}} faults
 * @returns per-quantity { si, unit, explanation } — SI base units in `si`.
 */
export function evaluate(params, faults = {}) {
  const load = clamp(params.load, 0, 120);
  const rpm = clamp(params.rpm, 0, 1800);
  const ambient = clamp(params.ambient, -10, 60);
  const bearingWear = !!faults.bearingWear;
  const coolingLoss = !!faults.coolingLoss;

  const r = rpm / NAMEPLATE.rpm; // normalised speed (affinity/imbalance basis)
  const x = load / 100; // normalised load

  // --- Winding temperature (IEC 60034 thermal rise; copper loss ∝ load²) -------
  // T = ambient + ΔT_full·load² · (cooling factor).  Loss of cooling raises the
  // effective rise ~35% (blocked fan cowl). Rise floors at a small iron-loss term.
  const coolFactor = coolingLoss ? 1.35 : 1.0;
  const tempRise = NAMEPLATE.tempRiseFull * (0.1 + 0.9 * x * x) * coolFactor;
  const tempC = ambient + tempRise;
  const temp = {
    si: tempC + K,
    unit: 'K',
    explanation: {
      formulaId: 'winding-temp',
      title: 'Winding temperature',
      latex: 'T = T_{amb} + \\Delta T_{full}\\,(0.1 + 0.9\\,x^2)\\,k_{cool}',
      steps: [
        ['x = load/100', `${load}/100 = ${x.toFixed(2)}`],
        ['ΔT_full', `${NAMEPLATE.tempRiseFull} K`],
        ['k_cool', coolingLoss ? '1.35 (cooling loss)' : '1.00'],
        ['ΔT = ΔT_full·(0.1+0.9x²)·k_cool', `${tempRise.toFixed(1)} K`],
        ['T = T_amb + ΔT', `${ambient} + ${tempRise.toFixed(1)} = ${tempC.toFixed(0)} °C`],
      ],
      result: `${tempC.toFixed(0)} °C`,
      assumptions: [
        'Steady-state thermal equilibrium (no warm-up transient).',
        'Copper loss dominates; iron loss lumped into the 0.1 floor term.',
        'Single lumped winding temperature, not a hot-spot model.',
      ],
    },
  };

  // --- Bearing vibration (ISO 10816/20816 velocity RMS) ------------------------
  // Imbalance force ∝ rpm², so residual velocity scales with r². A worn bearing
  // adds a load-dependent defect term. Reported as velocity RMS in mm/s.
  const vibImbalance = NAMEPLATE.vibResidual * r * r;
  const vibLoad = 0.6 * x;
  const vibWear = bearingWear ? 2.4 + 2.0 * r + 1.2 * x : 0;
  const vibMm = vibImbalance + vibLoad + vibWear; // mm/s
  const vib = {
    si: vibMm / 1000, // m/s
    unit: 'm/s',
    explanation: {
      formulaId: 'vibration',
      title: 'Bearing vibration (velocity RMS)',
      latex: 'v = v_{res}\\,r^2 + 0.6x + v_{wear}',
      steps: [
        ['r = rpm/rpm_n', `${rpm}/${NAMEPLATE.rpm} = ${r.toFixed(2)}`],
        ['v_res·r² (imbalance)', `${vibImbalance.toFixed(2)} mm/s`],
        ['0.6·x (load)', `${vibLoad.toFixed(2)} mm/s`],
        ['v_wear (bearing fault)', bearingWear ? `${vibWear.toFixed(2)} mm/s` : '0 (healthy)'],
        ['v = sum', `${vibMm.toFixed(1)} mm/s RMS`],
      ],
      result: `${vibMm.toFixed(1)} mm/s`,
      assumptions: [
        'Overall velocity RMS only — no frequency spectrum (FFT) is modelled.',
        'ISO 10816/20816 medium-machine zones: A<2.8, alarm 4.5, danger >7.1 mm/s.',
      ],
    },
  };

  // --- Discharge flow (pump affinity law: Q ∝ N) -------------------------------
  // Q scales linearly with speed; higher load throttles the system slightly.
  const flowH = Math.max(0, NAMEPLATE.flowBep * r * (1 - 0.003 * load)); // m3/h
  const flow = {
    si: flowH / 3600, // m3/s
    unit: 'm3/s',
    explanation: {
      formulaId: 'flow',
      title: 'Discharge flow',
      latex: 'Q = Q_{bep}\\,r\\,(1 - 0.003\\,load)',
      steps: [
        ['Q_bep', `${NAMEPLATE.flowBep} m³/h`],
        ['r', `${r.toFixed(2)}`],
        ['throttle (1−0.003·load)', `${(1 - 0.003 * load).toFixed(2)}`],
        ['Q', `${flowH.toFixed(0)} m³/h`],
      ],
      result: `${flowH.toFixed(0)} m³/h`,
      assumptions: [
        'First affinity law Q ∝ N, single fixed system curve.',
        'Incompressible single-phase liquid; no cavitation predicted.',
      ],
    },
  };

  // --- Motor line current (linear load line + fault friction) ------------------
  const iWear = bearingWear ? 1.4 * x : 0;
  const amps = NAMEPLATE.iNoLoad + (NAMEPLATE.iFull - NAMEPLATE.iNoLoad) * x + iWear;
  const current = {
    si: amps,
    unit: 'A',
    explanation: {
      formulaId: 'current',
      title: 'Motor line current',
      latex: 'I = I_0 + (I_{full}-I_0)\\,x + I_{wear}',
      steps: [
        ['I₀ (magnetising)', `${NAMEPLATE.iNoLoad} A`],
        ['(I_full−I₀)·x', `${((NAMEPLATE.iFull - NAMEPLATE.iNoLoad) * x).toFixed(1)} A`],
        ['I_wear (bearing drag)', bearingWear ? `${iWear.toFixed(1)} A` : '0'],
        ['I', `${amps.toFixed(1)} A`],
      ],
      result: `${amps.toFixed(1)} A`,
      assumptions: [
        'Linear current–load approximation about the duty point.',
        'Balanced 3-phase supply; power factor not resolved.',
      ],
    },
  };

  return { temp, vib, flow, current };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const MODEL = { id: 'sensors-motor-pump', version: '1.0' };
