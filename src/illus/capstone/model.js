/*
 * Capstone — pure model (Rulebook §2.1). Integrated line OEE: Availability ×
 * Performance × Quality, plus throughput. Ties the course together — one line,
 * every discipline's failure mode shows up in the same headline number. No
 * Math.random. Steady shift-average model, not an event simulation.
 */
export const NAMEPLATE = { cycleTime: 28, plannedDowntime: 30, scrapRate: 3 };
const SHIFT_MIN = 480; // 8 h shift
const IDEAL_CYCLE = 25; // s/unit design rate

export function evaluate(params, faults = {}) {
  let cycle = Math.max(1, params.cycleTime);
  let downtime = Math.max(0, params.plannedDowntime);
  let scrap = clamp(params.scrapRate, 0, 100);
  if (faults.breakdown) downtime += 120;
  if (faults.microstops) cycle += 6;
  if (faults.qualitySpill) scrap += 8;

  const runTime = Math.max(0, SHIFT_MIN - downtime);
  const availability = runTime / SHIFT_MIN;
  const performance = clamp(IDEAL_CYCLE / cycle, 0, 1);
  const quality = clamp(1 - scrap / 100, 0, 1);
  const oee = availability * performance * quality;
  const throughput = ((runTime * 60) / cycle) * quality / 8; // good units per hour

  return {
    oee: { si: oee, unit: '1', explanation: { formulaId: 'oee', title: 'Overall equipment effectiveness', latex: 'OEE = A \\times P \\times Q', steps: [['availability A', pct(availability)], ['performance P', pct(performance)], ['quality Q', pct(quality)], ['OEE', pct(oee)]], result: pct(oee), assumptions: ['World-class OEE ≈ 85%.', 'Shift-average, not an event-level simulation.'] } },
    avail: { si: availability, unit: '1', explanation: { formulaId: 'avail', title: 'Availability', latex: 'A = (T_{shift} - D)/T_{shift}', steps: [['shift', `${SHIFT_MIN} min`], ['downtime D', `${downtime} min`], ['run time', `${runTime} min`], ['A', pct(availability)]], result: pct(availability), assumptions: ['Planned + breakdown downtime lumped together.'] } },
    perf: { si: performance, unit: '1', explanation: { formulaId: 'perf', title: 'Performance', latex: 'P = c_{ideal}/c_{actual}', steps: [['ideal cycle', `${IDEAL_CYCLE} s`], ['actual cycle', `${cycle} s`], ['P', pct(performance)]], result: pct(performance), assumptions: ['Speed loss from microstops and slow running.'] } },
    qual: { si: quality, unit: '1', explanation: { formulaId: 'qual', title: 'Quality', latex: 'Q = 1 - scrap', steps: [['scrap', `${scrap.toFixed(1)} %`], ['Q', pct(quality)]], result: pct(quality), assumptions: ['First-pass yield; rework counted as loss.'] } },
    thru: { si: throughput, unit: 'units/h', explanation: { formulaId: 'thru', title: 'Good throughput', latex: 'X = \\frac{60\\,T_{run}}{c}\\,Q / 8', steps: [['run time', `${runTime} min`], ['cycle', `${cycle} s`], ['quality', pct(quality)], ['throughput', `${throughput.toFixed(0)} /h`]], result: `${throughput.toFixed(0)} units/h`, assumptions: ['Averaged over the 8 h shift.'] } },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pct(x) { return `${(x * 100).toFixed(1)} %`; }
export const MODEL = { id: 'line-oee', version: '1.0' };
