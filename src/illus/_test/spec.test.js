/*
 * §14.4 spec + model tests, run across all 10 tools (Illustration Rulebook
 * §3.3 depth checklist, §4.1 invariants, §14.4 determinism/limits/provenance,
 * §10.3 explanations, §2.3 no manufactured liveness).
 */
import { describe, it, expect } from 'vitest';
import { TOOLS, nameplate } from './tools.js';
import { bind } from '../binding.js';

describe.each(TOOLS)('$slug — spec + model', ({ spec, evaluate }) => {
  const np = nameplate(spec);

  it('meets the D3 depth checklist (§3.3)', () => {
    expect(spec.depth).toBeGreaterThanOrEqual(3);
    expect(spec.parameters.length).toBeGreaterThanOrEqual(3);
    expect(spec.quantities.length).toBeGreaterThanOrEqual(4);
    expect(spec.faults.length).toBeGreaterThanOrEqual(2);
    expect(spec.assumptions.length).toBeGreaterThanOrEqual(1);
  });

  it('every quantity declares tag, unit, display symbol and sig figs (§16 units)', () => {
    for (const q of spec.quantities) {
      expect(q.tag, `${q.key} tag`).toBeTruthy();
      expect(typeof q.unit, `${q.key} unit`).toBe('string');
      expect(q.display?.symbol, `${q.key} display symbol`).toBeTruthy();
      expect(q.sigFigs, `${q.key} sigFigs`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic — identical params give identical output (§2.3)', () => {
    expect(JSON.stringify(evaluate(np))).toBe(JSON.stringify(evaluate(np)));
  });

  it('produces finite results across and beyond the envelope, never NaN (§14.4 model.limits)', () => {
    const allFaults = Object.fromEntries(spec.faults.map((f) => [f.id, true]));
    for (const p of spec.parameters) {
      for (const v of [p.min, p.max, p.min - 10, p.max + 10, 0]) {
        const out = evaluate({ ...np, [p.key]: v }, allFaults);
        for (const q of spec.quantities) {
          expect(Number.isFinite(out[q.key]?.si), `${q.key} @ ${p.key}=${v}`).toBe(true);
        }
      }
    }
  });

  it('binds every quantity with source + quality provenance (§2.2, §14.4)', () => {
    const bound = bind(spec, evaluate(np), 0);
    expect(bound.length).toBe(spec.quantities.length);
    for (const bq of bound) {
      expect(bq.source, `${bq.key} source`).toBe('model');
      expect(bq.quality, `${bq.key} quality`).toBeTruthy();
      expect(bq.tag).toBeTruthy();
      expect(bq.displaySymbol).toBeTruthy();
    }
  });

  it('emits an explanation (formula + steps + assumptions) per quantity (§10.3)', () => {
    const out = evaluate(np);
    for (const q of spec.quantities) {
      const e = out[q.key]?.explanation;
      expect(e, `${q.key} explanation`).toBeTruthy();
      expect(e.steps?.length, `${q.key} steps`).toBeGreaterThanOrEqual(1);
      expect(e.assumptions?.length, `${q.key} assumptions`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every fault actually changes the model somewhere in the envelope (§10.4)', () => {
    // A fault may be physically conditional (e.g. memory paging only bites large
    // models), so probe across each parameter's range, not just at nameplate.
    const grid = spec.parameters.map((p) => [p.min, p.nameplate, p.max]);
    const combos = grid.reduce((acc, vals, i) => acc.flatMap((c) => vals.map((v) => ({ ...c, [spec.parameters[i].key]: v }))), [{}]);
    for (const f of spec.faults) {
      const changesSomewhere = combos.some((params) => {
        const base = evaluate(params);
        const tripped = evaluate(params, { [f.id]: true });
        return spec.quantities.some((q) => tripped[q.key]?.si !== base[q.key]?.si);
      });
      expect(changesSomewhere, `fault '${f.id}' has no effect anywhere in the envelope`).toBe(true);
    }
  });

  it('states what the model does not do (§9.6 notes)', () => {
    expect(Array.isArray(spec.notModelled) ? spec.notModelled.length : 0).toBeGreaterThanOrEqual(1);
  });
});
