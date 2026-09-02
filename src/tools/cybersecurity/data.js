/**
 * data.js (Cybersecurity tool)
 * ----------------------------
 * Researched content for OT defence-in-depth: an attack tries to cross from the
 * internet through the Purdue zones to the PLC; layered defences stop it.
 * Sources: Wikipedia IEC 62443 (zones & conduits, Security Levels 0-4) and
 * SCADA / Purdue levels; Stuxnet (2010) as the classic OT attack.
 */

/** Ordered Purdue-style zones from the outside in; the process sits behind all. */
export const ZONES = [
  { id: 'enterprise', name: 'Enterprise IT', level: 'L4/5', pos: -4.4 },
  { id: 'dmz', name: 'IT/OT DMZ', level: 'DMZ', pos: -2.2 },
  { id: 'supervisory', name: 'Supervisory', level: 'L2 SCADA', pos: 0 },
  { id: 'control', name: 'Control', level: 'L1 PLC', pos: 2.2 },
  { id: 'process', name: 'Process', level: 'L0 Field', pos: 4.4 },
];

/**
 * Defences, each guarding one zone boundary. `level` is the highest attacker
 * sophistication (IEC 62443 Security Level) it can stop.
 */
export const DEFENSES = [
  { id: 'firewall', name: 'Perimeter firewall', guards: 'enterprise', level: 2, detail: 'Filters traffic between the internet and the enterprise network. Stops casual and accidental intrusions.' },
  { id: 'dmz', name: 'IT/OT DMZ', guards: 'dmz', level: 3, detail: 'A demilitarised zone between IT and OT so no direct connection exists; data is brokered through it.' },
  { id: 'segmentation', name: 'Segmentation (zones & conduits)', guards: 'supervisory', level: 3, detail: 'IEC 62443 groups assets into zones and only allows communication through controlled conduits, containing any breach.' },
  { id: 'ids', name: 'IDS / IPS', guards: 'control', level: 4, detail: 'Intrusion detection/prevention watches OT traffic for anomalies and can block sophisticated, targeted attacks.' },
  { id: 'hardening', name: 'MFA & hardening', guards: 'process', level: 4, detail: 'Multi-factor authentication, patching and least-privilege on the controllers themselves: the last line of defence.' },
];

/** Attack types with their IEC 62443 Security Level (attacker sophistication). */
export const ATTACKS = [
  { id: 'phishing', name: 'Phishing', sl: 1, detail: 'A malicious email tricks an office user, giving the attacker a foothold on the IT network. Low sophistication (SL 1).' },
  { id: 'ransomware', name: 'Ransomware', sl: 2, detail: 'Commodity malware that spreads and encrypts systems for extortion. Simple means, few resources (SL 2).' },
  { id: 'targeted', name: 'Targeted malware', sl: 3, detail: 'A deliberate intrusion using automation-specific knowledge and moderate resources (SL 3).' },
  { id: 'stuxnet', name: 'Stuxnet-class', sl: 4, detail: 'A nation-state worm (like Stuxnet, 2010) that crosses the IT/OT gap to sabotage PLCs. Extensive resources (SL 4).' },
];

/**
 * Walk the attack inward: it is stopped at the first active defence whose level
 * meets the attacker sophistication. Otherwise it reaches the process (breach).
 */
export function simulateAttack(attackId, on) {
  const attack = ATTACKS.find((a) => a.id === attackId) ?? ATTACKS[0];
  // Active layers the attack slips past because their Security Level is too low.
  const bypassed = [];
  for (const d of DEFENSES) {
    if (!on[d.id]) continue;
    if (d.level >= attack.sl) {
      return { breached: false, stoppedBy: d.id, reached: d.guards, attack, bypassed };
    }
    bypassed.push(d.id);
  }
  return { breached: true, stoppedBy: null, reached: 'process', attack, bypassed };
}

/** Security posture: defence-in-depth score from the active layers. */
export function postureScore(on) {
  const active = DEFENSES.filter((d) => on[d.id]);
  return Math.round((active.length / DEFENSES.length) * 100);
}

/** IEC 62443 Security Levels (attacker classes). */
export const SECURITY_LEVELS = [
  { id: 'sl1', name: 'SL 1', detail: 'Protection against accidental or unintentional misuse.' },
  { id: 'sl2', name: 'SL 2', detail: 'Intentional misuse by simple means, few resources, low motivation.' },
  { id: 'sl3', name: 'SL 3', detail: 'Sophisticated means, moderate resources, automation-specific knowledge.' },
  { id: 'sl4', name: 'SL 4', detail: 'Sophisticated means, extensive resources and high motivation (nation-state).' },
];

/** Purdue reference model levels. */
export const PURDUE = [
  { id: 'l0', name: 'Level 0 · Field', detail: 'Sensors and actuators touching the physical process.' },
  { id: 'l1', name: 'Level 1 · Control', detail: 'PLCs and controllers running the real-time logic.' },
  { id: 'l2', name: 'Level 2 · Supervisory', detail: 'SCADA and HMI supervising the process.' },
  { id: 'l3', name: 'Level 3 · Operations', detail: 'MES / site operations and the plant network.' },
  { id: 'dmz', name: 'IT/OT DMZ', detail: 'The buffer that keeps IT and OT from touching directly.' },
  { id: 'l45', name: 'Level 4/5 · Enterprise', detail: 'Business IT, ERP and the internet.' },
];

/** Real OT threats worth knowing. */
export const THREATS = [
  { id: 'stuxnet', name: 'Stuxnet (2010)', detail: 'The first malware to attack SCADA/PLCs, using four zero-days to reprogram controllers and hide the changes.' },
  { id: 'ransomware', name: 'Ransomware', detail: 'Encrypts IT and can halt production; a plant may stop OT as a precaution even if OT is untouched.' },
  { id: 'phishing', name: 'Phishing / social', detail: 'The most common entry point: a tricked user hands over the first foothold.' },
  { id: 'insider', name: 'Insider / supply chain', detail: 'A disgruntled employee or a compromised vendor tool bypasses the perimeter entirely.' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'In IEC 62443, what groups assets with common security requirements?',
    options: [
      { id: 'a', label: 'Conduits' },
      { id: 'b', label: 'Zones' },
      { id: 'c', label: 'Firewalls' },
    ],
    answerId: 'b',
    explanation: 'Zones group assets with common security needs; conduits are the controlled channels that carry communication between zones.',
  },
  {
    id: 'q2',
    prompt: 'What is the main idea of "defence in depth"?',
    options: [
      { id: 'a', label: 'One very strong firewall is enough' },
      { id: 'b', label: 'Multiple independent layers so one failure is not fatal' },
      { id: 'c', label: 'Keeping OT disconnected forever' },
    ],
    answerId: 'b',
    explanation: 'Defence in depth stacks several independent controls so an attacker who beats one layer still meets the next.',
  },
  {
    id: 'q3',
    prompt: 'Why is an IT/OT DMZ used?',
    options: [
      { id: 'a', label: 'To speed up the PLC scan' },
      { id: 'b', label: 'So IT and OT never connect directly; data is brokered through it' },
      { id: 'c', label: 'To store backups only' },
    ],
    answerId: 'b',
    explanation: 'The DMZ removes any direct IT-to-OT path, forcing traffic through a controlled buffer and containing intrusions.',
  },
  {
    id: 'q4',
    prompt: 'A Stuxnet-class (Security Level 4) attack is heading for the PLC. Which defence can actually stop it?',
    options: [
      { id: 'a', label: 'A perimeter firewall (SL 2)' },
      { id: 'b', label: 'An IT/OT DMZ (SL 3)' },
      { id: 'c', label: 'IDS / IPS or MFA & hardening (SL 4)' },
    ],
    answerId: 'c',
    explanation: 'Defence in depth means matching the control to the attacker: only an SL 4 layer (IDS/IPS or MFA & hardening) stops an SL 4 attacker; weaker layers are bypassed.',
  },
];
