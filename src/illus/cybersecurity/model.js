/*
 * Cybersecurity — pure model (Rulebook §2.1). Defense-in-depth across the Purdue
 * zones (Enterprise → DMZ → Control → Field). Deterministic risk model from patch
 * level, firewall strictness and network segmentation. No Math.random. This is a
 * conceptual posture model — it does not simulate real attacks or exploits.
 */
export const NAMEPLATE = { patch: 80, firewall: 75, segmentation: 70 };

export function evaluate(params, faults = {}) {
  let patch = clamp(params.patch, 0, 100);
  let fw = clamp(params.firewall, 0, 100);
  let seg = clamp(params.segmentation, 0, 100);
  if (faults.unpatched) patch = Math.max(0, patch - 40);
  if (faults.firewallOff) fw = 0;
  if (faults.flatNetwork) seg = 0;

  const unpatched = (100 - patch) / 100;
  const fwFactor = 1 - (fw / 100) * 0.7;
  const segFactor = 1 - (seg / 100) * 0.6;

  const risk = clamp(100 * (0.2 + 0.8 * unpatched) * fwFactor * segFactor, 0, 100);
  const exposure = clamp(100 * (0.2 + 0.8 * unpatched) * fwFactor, 0, 100);
  const blast = clamp(100 * (1 - (seg / 100) * 0.85), 0, 100);
  const depth = (patch + fw + seg) / 3;

  return {
    risk: { si: risk / 100, unit: '1', explanation: { formulaId: 'risk', title: 'Residual risk', latex: 'R = (0.2 + 0.8u)\\,f_{fw}\\,f_{seg}', steps: [['unpatched u', `${(unpatched * 100).toFixed(0)} %`], ['firewall factor', fwFactor.toFixed(2)], ['segmentation factor', segFactor.toFixed(2)], ['risk', `${risk.toFixed(0)} %`]], result: `${risk.toFixed(0)} %`, assumptions: ['Multiplicative defense-in-depth (layers combine).', 'Conceptual posture, not an exploit simulation.'] } },
    exposure: { si: exposure / 100, unit: '1', explanation: { formulaId: 'exp', title: 'Attack surface', latex: 'E = (0.2 + 0.8u)\\,f_{fw}', steps: [['unpatched', `${(unpatched * 100).toFixed(0)} %`], ['firewall factor', fwFactor.toFixed(2)], ['exposure', `${exposure.toFixed(0)} %`]], result: `${exposure.toFixed(0)} %`, assumptions: ['Reachable, exploitable surface after perimeter controls.'] } },
    blast: { si: blast / 100, unit: '1', explanation: { formulaId: 'blast', title: 'Blast radius', latex: 'B = 1 - 0.85\\,s', steps: [['segmentation s', `${seg} %`], ['blast radius', `${blast.toFixed(0)} %`]], result: `${blast.toFixed(0)} %`, assumptions: ['How far one breach spreads without segmentation.', 'Flat networks let a single foothold reach everything.'] } },
    depth: { si: depth / 100, unit: '1', explanation: { formulaId: 'depth', title: 'Defense depth', latex: 'D = (patch + fw + seg)/3', steps: [['patch', `${patch} %`], ['firewall', `${fw} %`], ['segmentation', `${seg} %`], ['depth', `${depth.toFixed(0)} %`]], result: `${depth.toFixed(0)} %`, assumptions: ['Simple mean of the three control strengths.'] } },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'ot-security-posture', version: '1.0' };
