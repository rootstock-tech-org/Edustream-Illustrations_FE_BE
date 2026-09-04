/*
 * PLC & SCADA — pure behavioural model (Illustration Rulebook §2.1 MODEL layer).
 * A PLC running a tank-level control loop in ladder logic. Framework-free and
 * deterministic (no Math.random / no wall-clock). The plant is genuinely dynamic
 * — the level integrates and the pump cycles between setpoints — so motion here
 * represents real modelled change (§11), not manufactured liveness.
 *
 * Ladder rung (IEC 61131-3):
 *   Pump %QX0.0 = Run %IX0.0 AND ( LvlLow %IX0.1 OR Pump[seal-in] ) AND NOT LvlHigh %IX0.2
 */

export const CONFIG = {
  inRate: 22, // % per second when the pump+valve fill
  outRate: 32, // % per second draw at 100% demand
  scanMs: 20, // nominal PLC scan time
};

export const NAMEPLATE = { lowSP: 30, highSP: 70, demand: 40 };

// Addresses per IEC 61131 (§2.6).
export const ADDR = {
  run: '%IX0.0',
  lvlLow: '%IX0.1',
  lvlHigh: '%IX0.2',
  pump: '%QX0.0',
  valve: '%QX0.1',
  level: '%IW0',
};

// Solve the single ladder rung for one scan. Pure boolean logic; returns the
// coil states plus an Explanation trace of the rung evaluation (§10.3).
export function solveLadder({ run, mode, manualPump, levelLow, levelHigh, pumpSeal }, faults = {}) {
  const lLow = faults.stuckLow ? true : levelLow; // stuck-on low-level sensor
  let pump;
  if (!run) pump = false;
  else if (mode === 'manual') pump = !!manualPump;
  else pump = (lLow || pumpSeal) && !levelHigh; // seal-in latch
  if (faults.weldedPump) pump = true; // output contactor welded closed
  const valve = pump;

  const explanation = {
    formulaId: 'pump-rung',
    title: 'Pump coil rung',
    latex: '\\text{Pump} = \\text{Run} \\wedge (\\text{LvlLow} \\vee \\text{Pump}) \\wedge \\overline{\\text{LvlHigh}}',
    steps: [
      ['Run ' + ADDR.run, run ? 'TRUE' : 'FALSE'],
      ['Mode', mode],
      ['LvlLow ' + ADDR.lvlLow, (lLow ? 'TRUE' : 'FALSE') + (faults.stuckLow ? ' (stuck)' : '')],
      ['Pump seal-in', pumpSeal ? 'TRUE' : 'FALSE'],
      ['NOT LvlHigh', (!levelHigh ? 'TRUE' : 'FALSE')],
      [faults.weldedPump ? 'Contactor' : 'Rung result', faults.weldedPump ? 'WELDED → TRUE' : (pump ? 'TRUE' : 'FALSE')],
    ],
    result: pump ? 'ENERGISED' : 'de-energised',
    assumptions: [
      'One rung solved per scan on a stable input snapshot (read → solve → write).',
      'Seal-in latch gives the on/off hysteresis between the setpoints.',
    ],
  };
  return { pump, valve, lLow, levelHigh, explanation };
}

// One time step of the plant. Deterministic integration of the tank level.
export function stepPlant(state, dt, params, faults = {}) {
  const level = clamp(state.level, 0, 100);
  const levelLow = level <= params.lowSP;
  const levelHigh = level >= params.highSP;
  const { pump, valve, explanation } = solveLadder(
    { run: params.run, mode: params.mode, manualPump: params.manualPump, levelLow, levelHigh, pumpSeal: state.pumpSeal },
    faults,
  );
  const inflow = pump && valve ? CONFIG.inRate : 0;
  const outflow = params.run ? (params.demand / 100) * CONFIG.outRate : 0;
  const next = clamp(level + (inflow - outflow) * dt, 0, 100);
  return { level: next, pump, valve, levelLow, levelHigh, pumpSeal: pump, explanation };
}

// Bundle the displayed quantities (SI + explanation) from a plant state (§2.2 feeds this).
export function quantitiesOf(st) {
  const boolExp = (name, val) => ({
    si: val ? 1 : 0,
    unit: 'bool',
    explanation: { formulaId: name, title: name, latex: '', steps: [[name, val ? 'ENERGISED (1)' : 'off (0)']], result: val ? '1' : '0', assumptions: ['Discrete output written at end of scan.'] },
  });
  return {
    level: { si: st.level / 100, unit: '1', explanation: st.levelExp || { formulaId: 'level', title: 'Tank level', latex: 'L_{t+1} = L_t + (q_{in} - q_{out})\\,\\Delta t', steps: [['inflow', st.pump ? `${CONFIG.inRate} %/s` : '0'], ['outflow', `${(st.demand || 0)} % demand`], ['level', `${st.level.toFixed(0)} %`]], result: `${st.level.toFixed(0)} %`, assumptions: ['First-order tank; linear in/out flows.', 'No sensor lag or valve stroke time modelled.'] } },
    pump: { ...boolExp('Pump ' + ADDR.pump, st.pump), _rung: st.explanation },
    valve: boolExp('Valve ' + ADDR.valve, st.valve),
    scan: { si: CONFIG.scanMs / 1000, unit: 's', explanation: { formulaId: 'scan', title: 'Scan time', latex: '', steps: [['read+solve+write', `${CONFIG.scanMs} ms`]], result: `${CONFIG.scanMs} ms`, assumptions: ['Fixed nominal scan; real scan varies with program size.'] } },
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const MODEL = { id: 'plc-tank-level', version: '1.0' };
