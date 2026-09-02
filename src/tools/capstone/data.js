/**
 * data.js (Capstone tool)
 * -----------------------
 * The capstone ties the whole course together: build a smart factory by adding
 * the eight pillars (each an earlier module). More connected pillars raise the
 * factory's maturity from traditional to autonomous.
 */

/** The eight buildable pillars, each mapping to a module, placed on the floor. */
export const STATIONS = [
  { id: 'foundations', name: 'IoT Foundation', pos: [-4.5, -1.6], color: '#22d3ee', detail: 'The layered IoT architecture that connects the factory (Module 1).' },
  { id: 'sensors', name: 'Sensors', pos: [-1.5, -1.6], color: '#34d399', detail: 'Instruments that sense the physical process (Module 2).' },
  { id: 'communication', name: 'Communication', pos: [1.5, -1.6], color: '#38bdf8', detail: 'MQTT / industrial networks moving the data (Module 3).' },
  { id: 'edge', name: 'Edge AI', pos: [4.5, -1.6], color: '#a78bfa', detail: 'On-device inference for low-latency decisions (Module 4).' },
  { id: 'control', name: 'PLC & SCADA', pos: [4.5, 1.6], color: '#fbbf24', detail: 'Real-time control and supervision of the process (Module 6).' },
  { id: 'predictive', name: 'Predictive Maint.', pos: [1.5, 1.6], color: '#fb7185', detail: 'Health monitoring and RUL to prevent failures (Module 7).' },
  { id: 'security', name: 'Cybersecurity', pos: [-1.5, 1.6], color: '#2dd4bf', detail: 'Defence-in-depth protecting the OT network (Module 8).' },
  { id: 'robotics', name: 'Robotics', pos: [-4.5, 1.6], color: '#fb923c', detail: 'Robot cells doing the physical work (Module 9).' },
];

/** Maturity ladder from the readiness score. */
export const MATURITY = [
  { min: 0, name: 'Traditional', detail: 'Manual, disconnected operations. No live data.' },
  { min: 30, name: 'Connected', detail: 'Assets are instrumented and networked; data is visible.' },
  { min: 55, name: 'Digital', detail: 'Data drives control and dashboards across the plant.' },
  { min: 80, name: 'Smart', detail: 'AI, prediction and automation optimise the factory.' },
  { min: 100, name: 'Autonomous', detail: 'A fully integrated, self-optimising smart factory.' },
];

export function maturityFor(score) {
  return [...MATURITY].reverse().find((m) => score >= m.min) ?? MATURITY[0];
}

/** The Industry 4.0 pillars recap. */
export const PILLARS_INFO = [
  { id: 'connect', name: 'Connectivity', detail: 'Sensors, networks and IoT link every asset so data can flow.' },
  { id: 'data', name: 'Data & analytics', detail: 'Edge and cloud turn raw signals into insight and decisions.' },
  { id: 'control', name: 'Control', detail: 'PLCs and SCADA act on the process in real time.' },
  { id: 'intelligence', name: 'Intelligence', detail: 'AI, digital twins and prediction optimise and foresee.' },
  { id: 'resilience', name: 'Resilience', detail: 'Security and predictive maintenance keep it running safely.' },
  { id: 'autonomy', name: 'Autonomy', detail: 'Robotics and closed loops let the factory run itself.' },
];

/** Design tips. */
export const TIPS = [
  { id: 'sensefirst', name: 'Sense first', detail: 'Without sensors and connectivity there is no data, and nothing else works. Start there.' },
  { id: 'secure', name: 'Secure early', detail: 'Bolting on security later is costly. Design zones and conduits from day one.' },
  { id: 'edge', name: 'Right compute', detail: 'Put fast decisions at the edge and heavy analytics in the cloud.' },
  { id: 'people', name: 'People too', detail: 'Cobots and good HMIs keep humans in the loop, not out of it.' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'Which pillar must come first for any smart factory to function?',
    options: [
      { id: 'a', label: 'Robotics' },
      { id: 'b', label: 'Sensing and connectivity' },
      { id: 'c', label: 'Predictive maintenance' },
    ],
    answerId: 'b',
    explanation: 'Everything depends on data; without sensors and a network there is nothing to analyse, control or optimise.',
  },
  {
    id: 'q2',
    prompt: 'A factory with sensors, networks and dashboards but no AI or automation is best described as:',
    options: [
      { id: 'a', label: 'Autonomous' },
      { id: 'b', label: 'Traditional' },
      { id: 'c', label: 'Connected / Digital' },
    ],
    answerId: 'c',
    explanation: 'It is connected and digital: data is visible and drives dashboards, but intelligence and autonomy are not yet in place.',
  },
  {
    id: 'q3',
    prompt: 'Why include cybersecurity as a pillar rather than an afterthought?',
    options: [
      { id: 'a', label: 'It makes the PLC scan faster' },
      { id: 'b', label: 'Connecting everything expands the attack surface; a breach can stop production' },
      { id: 'c', label: 'It is only needed for the office network' },
    ],
    answerId: 'b',
    explanation: 'The more connected the factory, the larger the attack surface, so defence-in-depth must be designed in from the start.',
  },
];
