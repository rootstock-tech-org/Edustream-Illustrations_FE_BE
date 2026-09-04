/*
 * PLC & SCADA — dedicated §14.4 tests. This tool is a dynamic ladder-logic twin
 * (solveLadder + stepPlant), not the steady evaluate() shape, so it gets its own
 * suite: ladder truth, plant integration limits, provenance, and figure render.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PLC_SPEC } from '../plc-scada/spec.js';
import { solveLadder, stepPlant, quantitiesOf } from '../plc-scada/model.js';
import PlcFigure from '../plc-scada/PlcFigure.jsx';
import { bind } from '../binding.js';

const AUTO = { run: true, mode: 'auto', manualPump: false };

describe('plc-scada — spec', () => {
  it('meets the D3 depth checklist (§3.3)', () => {
    expect(PLC_SPEC.depth).toBeGreaterThanOrEqual(3);
    expect(PLC_SPEC.parameters.length).toBeGreaterThanOrEqual(3);
    expect(PLC_SPEC.quantities.length).toBeGreaterThanOrEqual(4);
    expect(PLC_SPEC.faults.length).toBeGreaterThanOrEqual(2);
    expect(PLC_SPEC.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(PLC_SPEC.notModelled.length).toBeGreaterThanOrEqual(1);
  });

  it('every numeric quantity carries a unit + sig figs (§16)', () => {
    for (const q of PLC_SPEC.quantities) {
      expect(typeof q.unit).toBe('string');
      expect(q.sigFigs).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('plc-scada — ladder logic (§15.2 IEC 61131)', () => {
  it('de-energises the pump when Run is off', () => {
    expect(solveLadder({ ...AUTO, run: false, levelLow: true, levelHigh: false, pumpSeal: false }).pump).toBe(false);
  });

  it('energises on low level and seals in until high (hysteresis)', () => {
    expect(solveLadder({ ...AUTO, levelLow: true, levelHigh: false, pumpSeal: false }).pump).toBe(true);
    // sealed-in: level no longer low, still below high -> stays on
    expect(solveLadder({ ...AUTO, levelLow: false, levelHigh: false, pumpSeal: true }).pump).toBe(true);
    // reaches high -> drops out even though sealed
    expect(solveLadder({ ...AUTO, levelLow: false, levelHigh: true, pumpSeal: true }).pump).toBe(false);
  });

  it('manual mode follows the manual pump switch', () => {
    expect(solveLadder({ run: true, mode: 'manual', manualPump: true, levelLow: false, levelHigh: true, pumpSeal: false }).pump).toBe(true);
    expect(solveLadder({ run: true, mode: 'manual', manualPump: false, levelLow: true, levelHigh: false, pumpSeal: true }).pump).toBe(false);
  });

  it('faults are real: welded contactor forces the pump on; stuck sensor holds LvlLow (§10.4)', () => {
    expect(solveLadder({ ...AUTO, run: false, levelLow: false, levelHigh: true, pumpSeal: false }, { weldedPump: true }).pump).toBe(true);
    expect(solveLadder({ ...AUTO, levelLow: false, levelHigh: false, pumpSeal: false }, { stuckLow: true }).lLow).toBe(true);
  });

  it('solveLadder is deterministic (§2.3)', () => {
    const inp = { ...AUTO, levelLow: true, levelHigh: false, pumpSeal: false };
    expect(JSON.stringify(solveLadder(inp))).toBe(JSON.stringify(solveLadder(inp)));
  });
});

describe('plc-scada — plant integration (§14.4 model.limits)', () => {
  const params = { run: true, mode: 'auto', manualPump: false, demand: 40, lowSP: 30, highSP: 70 };

  it('keeps the tank level finite and bounded [0,100] over a long run', () => {
    let st = { level: 20, pumpSeal: false };
    for (const demand of [0, 40, 100]) {
      st = { level: 20, pumpSeal: false };
      for (let i = 0; i < 500; i++) {
        st = stepPlant(st, 0.1, { ...params, demand });
        expect(Number.isFinite(st.level)).toBe(true);
        expect(st.level).toBeGreaterThanOrEqual(0);
        expect(st.level).toBeLessThanOrEqual(100);
      }
    }
  });

  it('binds every quantity with source + quality provenance (§2.2)', () => {
    const st = stepPlant({ level: 50, pumpSeal: false }, 0.1, params);
    const bound = bind(PLC_SPEC, quantitiesOf(st), 0);
    expect(bound.length).toBe(PLC_SPEC.quantities.length);
    for (const bq of bound) { expect(bq.source).toBe('model'); expect(bq.quality).toBeTruthy(); }
  });

  it('every quantity emits an explanation (§10.3)', () => {
    const q = quantitiesOf(stepPlant({ level: 50, pumpSeal: false }, 0.1, params));
    for (const k of ['level', 'pump', 'valve', 'scan']) {
      expect(q[k]?.explanation?.steps?.length, `${k} steps`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('plc-scada — render (§14.4)', () => {
  const params = { run: true, mode: 'auto', manualPump: false, demand: 40, lowSP: 30, highSP: 70 };
  function render() {
    const st = stepPlant({ level: 45, pumpSeal: false }, 0.1, params);
    const contacts = { run: params.run, lLow: st.levelLow, seal: st.pumpSeal, notHigh: !st.levelHigh };
    const bound = bind(PLC_SPEC, quantitiesOf(st), 0);
    return renderToStaticMarkup(createElement(PlcFigure, { spec: PLC_SPEC, contacts, level: st.level, params, bound, tSim: 0, onPick: () => {}, selected: null }));
  }
  it('is deterministic (§14.4 render.determinism)', () => { expect(render()).toBe(render()); });
  it('exposes role=img, <title>, <desc> (§13)', () => { const s = render(); expect(s).toContain('role="img"'); expect(s).toContain('<title'); expect(s).toContain('<desc'); });
  it('carries the provenance badge (§2.4)', () => { expect(render()).toContain('MODEL — NOT CONNECTED TO PLANT'); });
  it('matches its snapshot (§14.4 render.snapshot)', () => { expect(render()).toMatchSnapshot(); });
});
