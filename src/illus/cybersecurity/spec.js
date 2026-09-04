/*
 * Cybersecurity — AssetSpec (Rulebook §4, networks / IEC 62443 zones & conduits).
 */
import { NAMEPLATE, MODEL } from './model.js';

export const CYBER_SPEC = {
  id: 'ot-security-posture',
  name: 'OT security posture (Purdue zones)',
  discipline: 'networks',
  standard: 'IEC 62443 zones & conduits',
  view: 'topology',
  depth: 3,

  quantities: [
    { key: 'risk', tag: 'RISK', label: 'Residual risk', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'zone', limits: { hi: 0.4, hiHi: 0.7 }, formulaId: 'risk' },
    { key: 'exposure', tag: 'EXP', label: 'Attack surface', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'zone', limits: { hi: 0.4, hiHi: 0.7 }, formulaId: 'exp' },
    { key: 'blast', tag: 'BLAST', label: 'Blast radius', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'zone', limits: { hi: 0.5, hiHi: 0.8 }, formulaId: 'blast' },
    { key: 'depth', tag: 'DEPTH', label: 'Defense depth', unit: '1', display: { symbol: '%', scale: 100 }, range: [0, 100], sigFigs: 3, anchor: 'zone', limits: { lo: 0.5, loLo: 0.3 }, formulaId: 'depth' },
  ],

  parameters: [
    { key: 'patch', label: 'Patch level', symbol: 'P', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.patch },
    { key: 'firewall', label: 'Firewall strictness', symbol: 'F', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.firewall },
    { key: 'segmentation', label: 'Segmentation', symbol: 'S', unit: '%', min: 0, max: 100, step: 5, nameplate: NAMEPLATE.segmentation },
  ],

  faults: [
    { id: 'unpatched', label: 'Unpatched device', description: 'A device misses 40% of patches. Attack surface and risk jump — the classic weakest link.', affects: ['risk', 'exposure'] },
    { id: 'firewallOff', label: 'Firewall rule disabled', description: 'A conduit firewall is bypassed. The perimeter no longer reduces exposure.', affects: ['risk', 'exposure'] },
    { id: 'flatNetwork', label: 'Flat network (no segmentation)', description: 'Insidious: everything looks fine until one foothold reaches every zone — blast radius hits 100%.', affects: ['blast', 'risk'] },
  ],

  assumptions: [
    'Conceptual posture model — it does not simulate real exploits or attacks.',
    'Defense-in-depth layers combine multiplicatively.',
    'Blast radius reflects segmentation only.',
  ],
  notModelled: ['Specific CVEs / exploit chains', 'Threat intelligence and actor behaviour', 'Detection and response time'],
  model: MODEL,
};
