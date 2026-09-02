/**
 * data.js (Sensors tool)
 * ----------------------
 * Sensor placements on the simulated machine, the physics-ish reading model, and
 * reference content reused from the course. Model numbers are indicative.
 */

/** Metrics the machine produces; drive the readouts, colours and sparklines.
 *  Vibration thresholds follow ISO 10816/20816 velocity zones (medium machine):
 *  warn = Zone C boundary 4.5 mm/s, bad = Zone D boundary 7.1 mm/s RMS. */
export const METRICS = {
  temp: { label: 'Winding temp', unit: '°C', min: 30, max: 110, warn: 78, bad: 95, decimals: 0 },
  vib: { label: 'Vibration', unit: 'mm/s', min: 0, max: 12, warn: 4.5, bad: 7.1, decimals: 1 },
  flow: { label: 'Flow', unit: 'm³/h', min: 0, max: 70, warn: 999, bad: 999, decimals: 0 },
  current: { label: 'Motor current', unit: 'A', min: 0, max: 22, warn: 16, bad: 19, decimals: 1 },
};

/** Sensors mounted on the machine. `pos` is a 3D marker position in the scene.
 *  `spec` holds the researched, real-world specification for the selected card. */
export const MACHINE_SENSORS = [
  { id: 'winding', label: 'Motor winding', sensor: 'RTD (PT100)', quantity: 'Temperature', metric: 'temp', pos: [-1.1, 0.55, 0.35], why: 'Overheating windings warn of overload or cooling failure.', spec: 'PT100: 100 Ω at 0°C, 0.385 Ω/°C (IEC 60751), −200 to 600°C, wired 3-wire. Class F insulation limit is 155°C hot-spot.' },
  { id: 'bearing', label: 'Bearing', sensor: 'Accelerometer', quantity: 'Vibration', metric: 'vib', pos: [0.15, 0.5, 0.55], why: 'Rising vibration reveals wear, imbalance and misalignment.', spec: 'MEMS or piezo accelerometer. Judged by ISO 10816/20816 velocity zones: good <2.8, alarm 4.5, danger >7.1 mm/s RMS.' },
  { id: 'outlet', label: 'Pump outlet', sensor: 'Flow meter', quantity: 'Flow', metric: 'flow', pos: [1.75, 0.9, 0], why: 'Outlet flow confirms the pump is actually delivering.', spec: 'Electromagnetic (conductive liquids), ultrasonic (clamp-on) or Coriolis (true mass flow).' },
  { id: 'supply', label: 'Power supply', sensor: 'Current transformer', quantity: 'Current', metric: 'current', pos: [-1.9, 0.2, -0.4], why: 'Motor current tracks load and flags electrical faults.', spec: 'CT clamps around the conductor and reads load current without breaking the circuit; Hall-effect for DC.' },
];

/**
 * Steady-state readings for a given machine state. Temperature is returned as a
 * target the tool eases toward (thermal lag); the rest are instantaneous.
 */
export function computeReadings({ load, rpm, fault }) {
  const r = rpm / 1500; // normalised speed
  const f = fault ? 1 : 0;
  return {
    tempTarget: 40 + load * 0.42 + r * 10 + f * 12,
    vib: 0.8 + r * 0.7 + load * 0.02 + Math.max(0, load - 80) * 0.14 + f * (2.4 + r * 1.6),
    flow: Math.max(0, r * 62 * (1 - load * 0.003)),
    current: 2 + load * 0.12 + r * 3 + f * 1.6,
  };
}

/** Reference: which sensor to pick for what you want to measure. Specs researched from IEC 60751 / vendor data. */
export const SENSOR_TYPES = [
  { id: 'temperature', name: 'Temperature', detail: 'Thermocouple type K (−200 to +1260°C, fast, ±2°C); RTD PT100 (100Ω@0°C, most accurate, IEC 60751, ≤600°C); thermistor (cheap, narrow); IR (non-contact).' },
  { id: 'vibration', name: 'Vibration', detail: 'MEMS accelerometer (cheap monitoring) or piezo (high-frequency bearing faults). Severity graded by ISO 10816/20816 velocity zones.' },
  { id: 'flow', name: 'Flow', detail: 'Electromagnetic (conductive liquids), ultrasonic (clamp-on), Coriolis (true mass).' },
  { id: 'pressure', name: 'Pressure', detail: 'Piezoresistive is the workhorse; capacitive for low pressures.' },
  { id: 'current', name: 'Current', detail: 'Hall-effect or current transformer measure without breaking the circuit.' },
];

/** ISO 10816 / 20816 vibration severity zones (velocity RMS, medium machine). */
export const VIBRATION_ZONES = [
  { zone: 'A', label: 'Good', upto: 2.8, tone: 'ok', note: 'Typical of a newly commissioned machine.' },
  { zone: 'B', label: 'Acceptable', upto: 4.5, tone: 'ok', note: 'Fine for unrestricted long-term operation.' },
  { zone: 'C', label: 'Unsatisfactory', upto: 7.1, tone: 'warn', note: 'Limited operation only; plan corrective action.' },
  { zone: 'D', label: 'Danger', upto: Infinity, tone: 'bad', note: 'Vibration can cause damage; stop and investigate.' },
];

/** Motor winding insulation thermal classes (IEC 60034 max hot-spot). */
export const INSULATION_CLASSES = [
  { cls: 'A', max: 105 },
  { cls: 'B', max: 130 },
  { cls: 'F', max: 155 },
  { cls: 'H', max: 180 },
];

/** Requirements + boards for the Embedded Board Selector widget. */
export const BOARD_REQUIREMENTS = [
  { id: 'wireless', label: 'Wireless' },
  { id: 'ai', label: 'Edge AI' },
  { id: 'realtime', label: 'Hard real-time' },
  { id: 'battery', label: 'Battery' },
  { id: 'cheap', label: 'Low cost' },
];
export const EMBEDDED_BOARDS = [
  { id: 'avr', name: '8-bit MCU (Arduino)', note: 'Cheap and simple for a few sensors and outputs.', fits: ['battery', 'cheap'] },
  { id: 'esp32', name: 'ESP32', note: 'Built-in Wi-Fi/BT, the default low-cost connected node.', fits: ['wireless', 'battery', 'cheap'] },
  { id: 'stm32', name: 'STM32 (Cortex-M)', note: 'Precise timing for deterministic real-time control.', fits: ['realtime', 'battery', 'cheap'] },
  { id: 'rpi', name: 'Raspberry Pi', note: 'Linux gateway; aggregates nodes and runs dashboards.', fits: ['wireless', 'ai'] },
  { id: 'jetson', name: 'NVIDIA Jetson', note: 'GPU for vision/ML at the edge; higher power.', fits: ['wireless', 'ai'] },
];

/** Requirements + protocols for the Protocol Selector widget. */
export const PROTOCOL_REQUIREMENTS = [
  { id: 'many', label: 'Many devices' },
  { id: 'far', label: 'Long distance' },
  { id: 'fast', label: 'High speed' },
  { id: 'fewwires', label: 'Few wires' },
  { id: 'noisy', label: 'Noisy / robust' },
];
export const WIRING_PROTOCOLS = [
  { id: 'analog', name: 'Analog (ADC)', note: 'Read a varying voltage directly; noise-prone over distance.', fits: ['fewwires'] },
  { id: 'i2c', name: 'I²C', note: 'Two shared wires address many low-speed chips on a board.', fits: ['many', 'fewwires'] },
  { id: 'spi', name: 'SPI', note: 'Fast full-duplex for on-board chips; a CS line per device.', fits: ['fast'] },
  { id: 'uart', name: 'UART', note: 'Simple point-to-point serial between two devices.', fits: ['fewwires'] },
  { id: 'modbus', name: 'Modbus RTU (RS-485)', note: 'Differential bus for many field devices over long runs.', fits: ['many', 'far', 'noisy'] },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'To catch early bearing wear, which quantity do you monitor?',
    options: [
      { id: 'a', label: 'Humidity' },
      { id: 'b', label: 'Vibration' },
      { id: 'c', label: 'Ambient light' },
    ],
    answerId: 'b',
    explanation: 'Vibration (via an accelerometer) rises as bearings wear, which is the basis of condition monitoring.',
  },
  {
    id: 'q2',
    prompt: 'Which sensor best measures very high furnace temperatures (~1600°C)?',
    options: [
      { id: 'a', label: 'Thermistor' },
      { id: 'b', label: 'RTD (PT100)' },
      { id: 'c', label: 'Thermocouple' },
    ],
    answerId: 'c',
    explanation: 'Thermocouples handle the widest, highest ranges (up to ~1800°C).',
  },
  {
    id: 'q3',
    prompt: 'As motor load rises past its limit, what happens to winding temperature and vibration?',
    options: [
      { id: 'a', label: 'Both fall' },
      { id: 'b', label: 'Both rise' },
      { id: 'c', label: 'Nothing changes' },
    ],
    answerId: 'b',
    explanation: 'Overload heats the windings and increases vibration, exactly what the sensors here show.',
  },
];
