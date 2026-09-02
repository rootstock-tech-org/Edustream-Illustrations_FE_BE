/**
 * data.js (Predictive Maintenance tool)
 * -------------------------------------
 * Researched content for the PdM tool: a rotating machine that degrades over
 * time. Covers machine health, Remaining Useful Life (RUL), the P-F curve,
 * maintenance strategies and condition-monitoring techniques.
 * Sources: Wikipedia Predictive maintenance (condition-based, RUL/time-to-
 * failure, technologies) and ISO 10816/20816 vibration velocity zones.
 */

/** Clickable machine parts. `pos` is a 3D marker position. */
export const NODES = [
  { id: 'motor', role: 'machine', name: 'Motor', pos: [-1.3, 0.9, 0], detail: 'The rotating machine under watch. Predictive maintenance judges its condition from live measurements, not from a fixed calendar, so it is serviced only when the data says it is needed.' },
  { id: 'bearing', role: 'wear', name: 'Bearing', pos: [1.2, 0.9, 0], detail: 'The part that wears out. As it degrades, vibration and temperature climb. This is the fault that condition monitoring is designed to catch early.' },
  { id: 'sensor', role: 'sensor', name: 'Vibration Sensor', pos: [1.2, 1.9, 0], detail: 'An accelerometer measuring vibration velocity (mm/s). ISO 10816/20816 grades it: good below 2.8, alarm around 4.5, danger above 7.1 mm/s RMS.' },
];

/** Health bands: colour-coded condition + the action each implies. */
export const HEALTH_BANDS = [
  { id: 'healthy', name: 'Healthy', min: 70, color: '#34d399', action: 'Operate normally; keep trending the data.' },
  { id: 'warning', name: 'Warning', min: 40, color: '#fbbf24', action: 'Degradation is now detectable. Plan an inspection.' },
  { id: 'alert', name: 'Alert', min: 20, color: '#fb923c', action: 'Schedule maintenance soon, before failure.' },
  { id: 'critical', name: 'Critical', min: 0, color: '#fb7185', action: 'Repair now; functional failure is imminent.' },
];

export function bandFor(health) {
  return HEALTH_BANDS.find((b) => health >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1];
}

/**
 * Advance the machine by dtDays. Wear depends on load (and a fault), which
 * drives vibration and temperature up and Remaining Useful Life down.
 * s: { health, load, running, fault }
 */
export function stepHealth(s, dtDays) {
  const wearPerDay = (0.5 + (s.load / 100) * 2.5) * (s.fault ? 3 : 1); // % health lost per day
  const health = Math.max(0, Math.min(100, s.health - (s.running ? wearPerDay * dtDays : 0)));
  const vib = 1.2 + ((100 - health) / 100) * 9.5; // mm/s RMS (ISO 10816 range)
  const temp = 42 + s.load * 0.28 + ((100 - health) / 100) * 38; // deg C
  // RUL: days until functional failure (health hits 10) at the current wear rate.
  const rul = health <= 10 ? 0 : health >= 100 && !s.running ? Infinity : (health - 10) / wearPerDay;
  return { health, vib, temp, rul, wearPerDay, band: bandFor(health).id };
}

/** The P-F curve markers (standard reliability concept). */
export const PF = {
  P: { at: 70, label: 'P · Potential failure', note: 'Degradation first becomes detectable here: vibration and temperature start to rise. Condition monitoring catches the fault at this point.' },
  F: { at: 10, label: 'F · Functional failure', note: 'The machine can no longer do its job. Reactive maintenance only reacts here, after an unplanned breakdown.' },
  interval: 'The gap between P and F is the P-F interval: the window predictive maintenance uses to plan a repair before failure.',
};

/** The maintenance strategy ladder. */
export const STRATEGIES = [
  { id: 'reactive', name: 'Reactive', tag: 'Run-to-failure', detail: 'Fix it after it breaks. Cheapest to set up but causes unplanned downtime and often the most expensive failures.' },
  { id: 'preventive', name: 'Preventive', tag: 'Time-based', detail: 'Service on a fixed schedule regardless of condition. Reduces surprises but wastes life on healthy parts and can still miss faults between intervals.' },
  { id: 'predictive', name: 'Predictive', tag: 'Condition-based', detail: 'Service based on measured condition and a Remaining Useful Life estimate. Maintenance happens just before failure, cutting downtime and wasted parts.' },
  { id: 'prescriptive', name: 'Prescriptive', tag: 'AI-driven', detail: 'Goes further than predicting: it recommends the specific action and timing, optimising cost and risk automatically.' },
];

/** Condition-monitoring technologies (from the PdM technologies section). */
export const TECHNIQUES = [
  { id: 'vibration', name: 'Vibration analysis', detail: 'The workhorse for rotating machines. Spectrum (FFT) analysis reveals imbalance, misalignment and bearing faults; graded by ISO 10816/20816.' },
  { id: 'thermography', name: 'Infrared thermography', detail: 'Thermal cameras spot hot spots from friction, overload or loose electrical connections. The widest-range technique (mechanical and electrical).' },
  { id: 'oil', name: 'Oil analysis', detail: 'Used-oil analysis checks the lubricant condition; wear-particle analysis identifies metal debris that reveals which component is wearing.' },
  { id: 'acoustic', name: 'Acoustic / ultrasonic', detail: 'Listens to high-frequency friction and stress waves, often detecting deterioration earlier than vibration or oil analysis.' },
  { id: 'mcsa', name: 'Motor current signature', detail: 'MCSA analyses motor current and voltage to detect electrical and mechanical faults without touching the machine (non-intrusive).' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'What does Remaining Useful Life (RUL) estimate?',
    options: [
      { id: 'a', label: 'The age of the machine so far' },
      { id: 'b', label: 'The time left before the machine fails' },
      { id: 'c', label: 'The cost of a repair' },
    ],
    answerId: 'b',
    explanation: 'RUL is the predicted time remaining until the equipment can no longer perform its function, so maintenance can be scheduled just in time.',
  },
  {
    id: 'q2',
    prompt: 'How does predictive maintenance differ from preventive maintenance?',
    options: [
      { id: 'a', label: 'It services on a fixed time schedule' },
      { id: 'b', label: 'It waits for the machine to break first' },
      { id: 'c', label: 'It uses the measured condition of the equipment' },
    ],
    answerId: 'c',
    explanation: 'Preventive is time-based (whether needed or not); predictive uses live condition measurements to act only when the data warrants it.',
  },
  {
    id: 'q3',
    prompt: 'On the P-F curve, what is the "P-F interval"?',
    options: [
      { id: 'a', label: 'The time from detectable degradation (P) to functional failure (F)' },
      { id: 'b', label: 'The time between two inspections' },
      { id: 'c', label: 'The power factor of the motor' },
    ],
    answerId: 'a',
    explanation: 'The P-F interval is the window between the potential-failure point P (fault first detectable) and functional failure F, where PdM plans the repair.',
  },
];
