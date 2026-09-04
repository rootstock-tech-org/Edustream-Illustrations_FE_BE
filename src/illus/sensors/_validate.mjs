/*
 * Sensors spec + model checks (Illustration Rulebook §4.1 invariants + §14.4).
 * Run: node node_modules/.bin/... (tsx not needed — plain JS via node --input-type)
 * Here we just export a runnable check used by the step's verification.
 */
import { SENSORS_SPEC as S } from './spec.js';
import { evaluate } from './model.js';

const problems = [];
const ok = [];
const fail = (m) => problems.push(m);
const pass = (m) => ok.push(m);

const portIds = new Set(S.ports.map((p) => p.id));
const compIds = new Set(S.components.map((c) => c.id));
const linkIds = new Set(S.links.map((l) => l.id));
const portMedium = Object.fromEntries(S.ports.map((p) => [p.id, p.medium]));

// 1. every link.from/.to resolves to a port
const dangling = S.links.filter((l) => !portIds.has(l.from) || !portIds.has(l.to));
dangling.length ? fail(`dangling links: ${dangling.map((l) => l.id).join(', ')}`) : pass('no dangling links');

// 2. every component.ports entry resolves to a port
const badCompPorts = S.components.flatMap((c) => c.ports.filter((p) => !portIds.has(p)));
badCompPorts.length ? fail(`component ports not declared: ${badCompPorts.join(', ')}`) : pass('all component ports declared');

// 3. every quantity.anchor resolves to a component/port/link
const badAnchor = S.quantities.filter((q) => !compIds.has(q.anchor) && !portIds.has(q.anchor) && !linkIds.has(q.anchor));
badAnchor.length ? fail(`quantity anchors unresolved: ${badAnchor.map((q) => q.key).join(', ')}`) : pass('all quantity anchors resolve');

// 4. every coordinate is a multiple of 4 du (§6.2)
const offGrid = [];
for (const c of S.components) if (c.at[0] % 4 || c.at[1] % 4) offGrid.push(`comp ${c.id}`);
for (const p of S.ports) if (p.at[0] % 4 || p.at[1] % 4) offGrid.push(`port ${p.id}`);
offGrid.length ? fail(`off-grid coordinates: ${offGrid.join(', ')}`) : pass('every coordinate ≡ 0 mod 4 du');

// 5. process links (primary/secondary) match medium on both ports (§4.1.6).
//    Auxiliary = instrument measurement taps (process point → signal), exempt.
const mediumMismatch = S.links
  .filter((l) => l.rank !== 'auxiliary')
  .filter((l) => portMedium[l.from] !== l.medium || portMedium[l.to] !== l.medium);
mediumMismatch.length ? fail(`process-link medium mismatch: ${mediumMismatch.map((l) => l.id).join(', ')}`) : pass('process links medium-consistent');

// 6. legend covers every medium actually used
const usedMedia = new Set(S.links.map((l) => l.medium));
const legendMedia = new Set(S.legend.filter((e) => e.swatch === 'line').map((e) => e.token));
const uncovered = [...usedMedia].filter((m) => !legendMedia.has(m));
uncovered.length ? fail(`media not in legend: ${uncovered.join(', ')}`) : pass('legend covers every medium used');

// 7. assumptions ≥ 1 (§4.1.8)
S.assumptions.length >= 1 ? pass(`assumptions present (${S.assumptions.length})`) : fail('no assumptions stated');

// 8. depth ≥ 3, ≥3 params, ≥4 quantities, ≥2 faults (§3.3)
S.depth >= 3 ? pass(`depth D${S.depth}`) : fail('depth < 3');
S.parameters.length >= 3 ? pass(`${S.parameters.length} parameters`) : fail('<3 parameters');
S.quantities.length >= 4 ? pass(`${S.quantities.length} quantities`) : fail('<4 quantities');
S.faults.length >= 2 ? pass(`${S.faults.length} faults`) : fail('<2 faults');

// --- model checks (§14.4) ---------------------------------------------------
// determinism: identical params → identical output
const p = { load: 75, rpm: 1500, ambient: 25 };
const a = evaluate(p), b = evaluate(p);
JSON.stringify(a) === JSON.stringify(b) ? pass('model deterministic (no Math.random)') : fail('model NOT deterministic');

// no NaN across the envelope, including out-of-range inputs
let nan = false;
for (const load of [0, 50, 100, 120, 999]) for (const rpm of [0, 750, 1500, 1800, 9999]) {
  const r = evaluate({ load, rpm, ambient: 25 }, { bearingWear: true, coolingLoss: true });
  for (const q of Object.values(r)) if (!Number.isFinite(q.si)) nan = true;
}
nan ? fail('model produced NaN/Infinity') : pass('no NaN across envelope (out-of-range modelled, not hidden)');

// fault actually propagates (bearing wear raises vibration + current)
const healthy = evaluate(p, {});
const worn = evaluate(p, { bearingWear: true });
worn.vib.si > healthy.vib.si && worn.current.si > healthy.current.si
  ? pass('bearing-wear fault propagates (vib↑, current↑) — insidious, no flow alarm')
  : fail('bearing-wear fault does not propagate');

// every quantity carries an explanation with steps + assumptions (§10.3)
const missingExp = Object.entries(evaluate(p)).filter(([, q]) => !q.explanation || !q.explanation.steps?.length || !q.explanation.assumptions?.length);
missingExp.length ? fail(`quantities without explanation: ${missingExp.map(([k]) => k).join(', ')}`) : pass('every quantity emits an Explanation (formula+steps+assumptions)');

console.log('\n=== SENSORS SPEC + MODEL CHECK ===');
ok.forEach((m) => console.log('  PASS  ' + m));
problems.forEach((m) => console.log('  FAIL  ' + m));
console.log(`\n${ok.length} PASS, ${problems.length} FAIL`);
process.exit(problems.length ? 1 : 0);
