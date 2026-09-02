/**
 * data.js (Digital Twin tool)
 * ---------------------------
 * Content for a physical machine and its live digital twin. The twin mirrors
 * the physical asset via periodic sensor syncs; a low sync rate makes it lag
 * and diverge. Sources: Wikipedia Digital twin (strict definition: a model kept
 * dynamically in sync by live data; physical + digital + communication channel
 * aka the digital thread) and Kritzinger et al. 2018 (Model / Shadow / Twin by
 * data-flow direction). Twin scopes component/asset/system/process per IBM/GE.
 */

/** Clickable nodes in the twin scene. */
export const NODES = [
  { id: 'physical', role: 'physical', name: 'Physical asset', detail: 'The real machine on the factory floor. Its sensors stream live data (speed, temperature) that keep the digital twin in sync.' },
  { id: 'twin', role: 'twin', name: 'Digital twin', detail: 'A live virtual replica of the asset. It updates on each sensor sync and drifts between syncs (why a high sync rate matters). A full twin does more than mirror: it simulates ahead to predict, and can send commands back to the asset.' },
  { id: 'link', role: 'link', name: 'Sync link', detail: 'The communication channel (the digital thread) carrying sensor snapshots from the asset to the twin. Its update rate sets how fresh, and how accurate, the twin is. In a full twin this channel is two-way.' },
];

/** Twin types by scope. */
export const TWIN_TYPES = [
  { id: 'component', name: 'Component twin', detail: 'A single part, e.g. a bearing or motor. The smallest twin, used for detailed physics of one element.' },
  { id: 'asset', name: 'Asset twin', detail: 'A whole machine made of components (this tool). Tracks the machine\'s live condition and behaviour.' },
  { id: 'system', name: 'System twin', detail: 'A production line or cell of many assets, showing how they interact and where bottlenecks form.' },
  { id: 'process', name: 'Process twin', detail: 'The entire plant or process, used to optimise throughput, energy and scheduling end to end.' },
];

/** The digital-twin data loop. */
export const DATA_FLOW = [
  { id: 'sense', name: '1 · Sense', detail: 'Sensors on the physical asset measure its real state continuously.' },
  { id: 'sync', name: '2 · Sync', detail: 'Those readings stream to the virtual model, keeping the twin current.' },
  { id: 'simulate', name: '3 · Simulate', detail: 'The twin runs analytics and what-if simulations the real machine cannot risk.' },
  { id: 'act', name: '4 · Act', detail: 'Insights feed back as commands or maintenance actions, closing the loop.' },
];

/** What digital twins are used for. */
export const USE_CASES = [
  { id: 'monitor', name: 'Live monitoring', detail: 'See the exact state of a machine remotely, even from the other side of the world.' },
  { id: 'predict', name: 'Prediction', detail: 'Run the twin ahead of real time to forecast wear, failures and output.' },
  { id: 'whatif', name: 'What-if testing', detail: 'Try new settings or recipes on the twin safely before touching the real line.' },
  { id: 'optimize', name: 'Optimisation', detail: 'Search the twin for the best speed/energy trade-off, then apply it to the asset.' },
];

/**
 * Model vs Shadow vs Twin: the standard classification by how data flows
 * between the physical asset and its virtual model (Kritzinger et al. 2018).
 * This tool's live one-way sync is, strictly, a digital shadow.
 */
export const INTEGRATION_LEVELS = [
  { id: 'model', name: 'Digital Model', detail: 'A virtual model with no automatic data link. Data is moved by hand, so it never tracks the live asset. An offline CAD model or a one-off simulation sits here.' },
  { id: 'shadow', name: 'Digital Shadow', detail: 'Automatic ONE-WAY data flow: the asset streams live data to the model so it always reflects reality, but the model cannot change the asset. The live sync you are driving here is a digital shadow.' },
  { id: 'twin', name: 'Digital Twin', detail: 'Automatic TWO-WAY data flow: the model is fed live data AND sends commands back to control or optimise the asset, plus it simulates ahead to predict. Closing that loop is what makes it a true twin, not just a live dashboard.' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'What is a digital twin?',
    options: [
      { id: 'a', label: 'A backup copy of a database' },
      { id: 'b', label: 'A live virtual replica of a physical asset, kept in sync by its data' },
      { id: 'c', label: 'A second identical machine on the floor' },
    ],
    answerId: 'b',
    explanation: 'A digital twin is a virtual model continuously updated by the real asset\'s sensor data so it mirrors the real thing.',
  },
  {
    id: 'q2',
    prompt: 'Why does a low sync rate hurt the twin?',
    options: [
      { id: 'a', label: 'It makes the twin update too often' },
      { id: 'b', label: 'The twin gets stale between updates and diverges from reality' },
      { id: 'c', label: 'It has no effect' },
    ],
    answerId: 'b',
    explanation: 'With infrequent syncs the twin holds old data while the asset changes, so divergence grows and accuracy drops.',
  },
  {
    id: 'q3',
    prompt: 'A key advantage of running "what-if" tests on the twin is:',
    options: [
      { id: 'a', label: 'It is cheaper to buy' },
      { id: 'b', label: 'You can try risky changes safely without stopping the real machine' },
      { id: 'c', label: 'It removes the need for sensors' },
    ],
    answerId: 'b',
    explanation: 'The twin lets you simulate changes and failures safely, avoiding downtime and risk on the real asset.',
  },
  {
    id: 'q4',
    prompt: 'What separates a full digital twin from a digital shadow?',
    options: [
      { id: 'a', label: 'The twin has a nicer 3D model' },
      { id: 'b', label: 'The shadow is one-way live data; the twin also sends commands back (two-way) and simulates ahead' },
      { id: 'c', label: 'A shadow needs no sensors' },
    ],
    answerId: 'b',
    explanation: 'A digital shadow is one-way (asset to model). A digital twin adds a two-way link so it can act back on the asset, and it simulates to predict and optimise (Kritzinger 2018).',
  },
];

/** Digital Twin Builder: capabilities you switch on to assemble a twin. */
export const TWIN_CAPS = [
  { id: 'link', name: 'Live data link', detail: 'Sensors stream the asset state to the virtual model automatically (one-way).' },
  { id: 'simulate', name: 'Simulate ahead', detail: 'The model runs faster than real time to forecast future state and wear.' },
  { id: 'control', name: 'Two-way control', detail: 'The model sends commands back to the asset, closing the loop.' },
];

/** Classify the built model by data-flow direction (Kritzinger 2018). */
export function twinLevel(capSet) {
  if (!capSet.has('link')) return INTEGRATION_LEVELS[0]; // Digital Model
  if (capSet.has('control')) return INTEGRATION_LEVELS[2]; // Digital Twin
  return INTEGRATION_LEVELS[1]; // Digital Shadow
}

/** CPS Explorer: the cyber-physical loop stages, in order around the loop. */
export const CPS_STAGES = [
  { id: 'physical', name: 'Physical process', hue: '#94a3b8', detail: 'The real machine or process doing physical work on the factory floor.' },
  { id: 'sensors', name: 'Sensors', hue: '#34d399', detail: 'Measure the physical state (speed, temperature, vibration) and convert it to data.' },
  { id: 'network', name: 'Network', hue: '#38bdf8', detail: 'Carries the sensor data to compute, and commands back, over an industrial link (the digital thread).' },
  { id: 'cyber', name: 'Cyber / Twin', hue: '#818cf8', detail: 'The digital twin and analytics: it mirrors the asset, simulates ahead and decides what to do.' },
  { id: 'actuators', name: 'Actuators', hue: '#f59e0b', detail: 'Turn the cyber decisions back into physical action (motors, valves), closing the loop.' },
];
