/**
 * data.js (PLC & SCADA tool)
 * --------------------------
 * Researched content for the automation tool: a PLC-controlled tank-level
 * process with a SCADA/HMI view. Covers the PLC scan cycle, live ladder logic,
 * IEC 61131-3 languages and the SCADA level hierarchy.
 * Sources: Wikipedia Programmable logic controller (scan cycle, IEC 61131-3,
 * Modicon 084) and SCADA (levels 0-4, RTU / HMI / historian, alarms).
 */

/** Clickable parts of the 3D plant. `pos` is a 3D marker position. */
export const NODES = [
  { id: 'plc', role: 'controller', name: 'PLC', pos: [-3.4, 1.1, 0], detail: 'The Programmable Logic Controller: a ruggedised industrial computer (first was the Modicon 084, 1968). It reads inputs, solves the control program and drives the outputs, over and over in a fast scan cycle. This is a hard real-time system.' },
  { id: 'tank', role: 'process', name: 'Tank', pos: [0.4, 1.5, 0], detail: 'The controlled process: a liquid tank. The PLC keeps the level between the low and high setpoints by switching the pump and valve. This closed loop is one "control loop".' },
  { id: 'pump', role: 'actuator', name: 'Pump', pos: [-1.4, -0.15, 0], detail: 'A final control element (output/actuator). The PLC energises it to fill the tank. In ladder logic it is a coil driven by the rungs.' },
  { id: 'valve', role: 'actuator', name: 'Inlet Valve', pos: [-0.4, 2.7, 0], detail: 'The inlet control valve (output/actuator). It opens with the pump to admit flow. Discrete outputs like this are simple on/off.' },
  { id: 'sensor', role: 'sensor', name: 'Level Sensor', pos: [2.1, 1.6, 0], detail: 'A field instrument (input). It reports the tank level. A discrete signal is on/off; an analog level (0-10 V or 4-20 mA) is read as an integer the program scales into engineering units.' },
];

/**
 * One PLC scan: read inputs, solve the ladder logic (with a seal-in latch for
 * hysteresis), then write outputs, and integrate the simple tank physics.
 * s: { level, running, mode, pumpCmd, valveCmd, lowSP, highSP, demand, pumpLatch }
 */
export function stepPlant(s, dt) {
  const lvlLow = s.level <= s.lowSP;
  const lvlHigh = s.level >= s.highSP;

  let pump;
  let valve;
  if (!s.running) {
    pump = false;
    valve = false;
  } else if (s.mode === 'manual') {
    pump = s.pumpCmd;
    valve = s.valveCmd;
  } else {
    // Auto seal-in latch: Pump = Run AND (LvlLow OR Pump) AND NOT LvlHigh
    pump = (lvlLow || s.pumpLatch) && !lvlHigh;
    valve = pump;
  }

  const IN_RATE = 22; // % per second when filling
  const OUT_RATE = 32; // % per second at full demand (can exceed inflow, so high demand overpowers the pump)
  const inflow = pump && valve ? IN_RATE : 0;
  const outflow = s.running ? (s.demand / 100) * OUT_RATE : 0;
  let level = s.level + (inflow - outflow) * dt;
  level = Math.max(0, Math.min(100, level));

  const alarms = [];
  if (level >= 95) alarms.push({ id: 'HH', text: 'HIGH-HIGH level', sev: 'high' });
  else if (level >= s.highSP) alarms.push({ id: 'H', text: 'High level reached', sev: 'warn' });
  if (level <= 2) alarms.push({ id: 'LL', text: 'LOW-LOW level', sev: 'high' });
  else if (level <= s.lowSP) alarms.push({ id: 'L', text: 'Low level reached', sev: 'warn' });

  return { level, pump, valve, lvlLow, lvlHigh, alarms, pumpLatch: pump };
}

/** The three steps every PLC repeats, tens of ms per loop. */
export const SCAN_STEPS = [
  { id: 'read', name: 'Read inputs', detail: 'The PLC samples every input (sensors, switches, level) and stores a snapshot in memory, so the logic sees a stable picture all scan.' },
  { id: 'exec', name: 'Execute program', detail: 'It solves the control program (here, ladder logic) top-to-bottom using that input snapshot, computing every coil and internal bit.' },
  { id: 'write', name: 'Write outputs', detail: 'It updates all physical outputs at once from the result (pump, valve, lamps), then does housekeeping and comms, and loops again.' },
];

/** IEC 61131-3: the five standard PLC programming languages. */
export const IEC_LANGUAGES = [
  { id: 'ld', name: 'Ladder Diagram', tag: 'Graphical', detail: 'Looks like a relay wiring schematic: contacts in series are AND, in parallel are OR, driving coils. The most popular language, easy for electricians.' },
  { id: 'fbd', name: 'Function Block Diagram', tag: 'Graphical', detail: 'Signals wired through blocks (AND, timers, PID). Great for continuous and signal-processing logic.' },
  { id: 'st', name: 'Structured Text', tag: 'Textual', detail: 'A high-level, Pascal-like language with IF/FOR/WHILE. Best for maths and complex algorithms.' },
  { id: 'il', name: 'Instruction List', tag: 'Textual', detail: 'A low-level, assembly-like language. Deprecated in the third edition of IEC 61131-3.' },
  { id: 'sfc', name: 'Sequential Function Chart', tag: 'Graphical', detail: 'Steps and transitions for sequential processes, like a state machine for batch or start-up sequences.' },
];

/** SCADA functional levels (Purdue / ISA-95 style, from the SCADA standard). */
export const SCADA_LEVELS = [
  { id: 'l0', level: 0, name: 'Field devices', detail: 'Sensors and final control elements (control valves, motors) that touch the physical process.' },
  { id: 'l1', level: 1, name: 'Control (PLC / RTU)', detail: 'PLCs and RTUs run the real-time control logic locally and keep the process running even if the network drops.' },
  { id: 'l2', level: 2, name: 'Supervisory (SCADA / HMI)', detail: 'Supervisory computers gather data and present operator screens (HMI). Operators change setpoints and acknowledge alarms here.' },
  { id: 'l3', level: 3, name: 'Production control', detail: 'Monitors production and targets (MES). It does not directly control the process.' },
  { id: 'l4', level: 4, name: 'Scheduling', detail: 'Production scheduling and business planning (ERP).' },
];

/** SCADA building blocks worth knowing. */
export const SCADA_COMPONENTS = [
  { id: 'hmi', name: 'HMI', detail: 'The operator window: mimic diagrams of the plant with live values, alarm pages and trend graphs. Click a pump symbol to start it.' },
  { id: 'rtu', name: 'RTU', detail: 'Remote Terminal Unit: a rugged, low-power PLC at a remote site that manages the communication link (radio, GSM, satellite) and time-stamps events.' },
  { id: 'historian', name: 'Historian', detail: 'A software service that logs time-stamped tags, events and alarms into a database for trending and analysis.' },
  { id: 'comms', name: 'Comms', detail: 'The network linking SCADA to the PLCs/RTUs. Protocols include Modbus, DNP3, IEC 60870-5 and OPC UA.' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'What are the three steps of a PLC scan cycle, in order?',
    options: [
      { id: 'a', label: 'Write outputs, execute, read inputs' },
      { id: 'b', label: 'Read inputs, execute program, write outputs' },
      { id: 'c', label: 'Execute, read inputs, write outputs' },
    ],
    answerId: 'b',
    explanation: 'Every scan the PLC reads all inputs, executes the program on that snapshot, then writes all outputs, and repeats.',
  },
  {
    id: 'q2',
    prompt: 'In ladder logic, two contacts placed in series perform which logic function?',
    options: [
      { id: 'a', label: 'OR' },
      { id: 'b', label: 'NOT' },
      { id: 'c', label: 'AND' },
    ],
    answerId: 'c',
    explanation: 'Series contacts must all be true for current to reach the coil (AND); parallel contacts form an OR.',
  },
  {
    id: 'q3',
    prompt: 'In the SCADA hierarchy, where does the operator view mimic screens and acknowledge alarms?',
    options: [
      { id: 'a', label: 'Level 0 - field devices' },
      { id: 'b', label: 'Level 1 - PLC / RTU' },
      { id: 'c', label: 'Level 2 - supervisory SCADA / HMI' },
    ],
    answerId: 'c',
    explanation: 'Level 2 is the supervisory layer: SCADA computers and the HMI where operators supervise, change setpoints and handle alarms.',
  },
];
