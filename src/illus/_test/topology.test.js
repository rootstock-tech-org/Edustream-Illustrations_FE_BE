/*
 * §4.1 topology invariants — only tools whose spec declares a full port /
 * component / link topology (today: sensors). Light specs delegate geometry to
 * their Figure and are covered by the render suite instead.
 */
import { describe, it, expect } from 'vitest';
import { TOOLS } from './tools.js';

const topological = TOOLS.filter((t) => t.spec.ports && t.spec.components && t.spec.links);

describe.each(topological)('$slug — topology (§4.1)', ({ spec }) => {
  const portIds = new Set(spec.ports.map((p) => p.id));
  const compIds = new Set(spec.components.map((c) => c.id));
  const linkIds = new Set(spec.links.map((l) => l.id));
  const portMedium = Object.fromEntries(spec.ports.map((p) => [p.id, p.medium]));

  it('has no dangling links (§4.1.1)', () => {
    for (const l of spec.links) {
      expect(portIds.has(l.from), `${l.id}.from`).toBe(true);
      expect(portIds.has(l.to), `${l.id}.to`).toBe(true);
    }
  });

  it('every component port is declared (§4.1.2)', () => {
    for (const c of spec.components) for (const p of c.ports) expect(portIds.has(p), `${c.id}:${p}`).toBe(true);
  });

  it('every quantity anchor resolves (§4.1.4)', () => {
    for (const q of spec.quantities) {
      expect(compIds.has(q.anchor) || portIds.has(q.anchor) || linkIds.has(q.anchor), `${q.key} anchor ${q.anchor}`).toBe(true);
    }
  });

  it('every coordinate is a multiple of 4 du (§4.1.5, §6.2)', () => {
    for (const c of spec.components) { expect(c.at[0] % 4, `comp ${c.id} x`).toBe(0); expect(c.at[1] % 4, `comp ${c.id} y`).toBe(0); }
    for (const p of spec.ports) { expect(p.at[0] % 4, `port ${p.id} x`).toBe(0); expect(p.at[1] % 4, `port ${p.id} y`).toBe(0); }
  });

  it('process links are medium-consistent on both ends (§4.1.6)', () => {
    for (const l of spec.links.filter((x) => x.rank !== 'auxiliary')) {
      expect(portMedium[l.from], `${l.id}.from medium`).toBe(l.medium);
      expect(portMedium[l.to], `${l.id}.to medium`).toBe(l.medium);
    }
  });

  it('legend covers every medium used (§4.1.7)', () => {
    const used = new Set(spec.links.map((l) => l.medium));
    const legend = new Set(spec.legend.filter((e) => e.swatch === 'line').map((e) => e.token));
    for (const m of used) expect(legend.has(m), `medium '${m}' missing from legend`).toBe(true);
  });
});
