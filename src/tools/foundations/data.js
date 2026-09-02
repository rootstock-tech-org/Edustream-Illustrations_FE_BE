/**
 * data.js (Foundations tool content)
 * ----------------------------------
 * Reused researched content: IIoT architecture layers, industry evolution,
 * RAMI 4.0 axes, ISA-95, IoT vs IIoT, and questions. Feeds the 3D scene and the
 * interactive widgets. Revolution years are commonly-cited approximations.
 */

/** Layers of the standard IoT architecture, bottom (sensing) to top (application).
 *  Data flows upward: Sensing -> Network -> Data Processing -> Application.
 *  Model per GeeksforGeeks "Architecture of IoT" + Wikipedia "Internet of things". */
export const IOT_ARCH_LAYERS = [
  { id: 'sensing', name: 'Sensing Layer', short: 'Sensors & actuators', detail: 'The bottom layer: sensors detect physical conditions (temperature, humidity, motion) and actuators act on them. This is where IoT data is born, then passed up to the network layer.', examples: ['Temperature sensor', 'Actuator / relay', 'RFID tag'] },
  { id: 'network', name: 'Network Layer', short: 'Connectivity & routing', detail: 'Provides connectivity between devices and cloud systems: securely transmits the sensed data upward and handles addressing, routing and forwarding.', examples: ['Wi-Fi / Zigbee', 'MQTT', 'Gateway / router'] },
  { id: 'processing', name: 'Data Processing Layer', short: 'Analytics & storage', detail: 'Cleans, filters and analyses the incoming data, applies analytics/ML to detect patterns and anomalies, and stores it. Runs at the edge and in the cloud.', examples: ['Edge filtering', 'Cloud analytics', 'ML / anomaly detection'] },
  { id: 'application', name: 'Application Layer', short: 'Dashboards & decisions', detail: 'The top layer that people and business systems use: dashboards, alerts, remote control and integration with MES / ERP.', examples: ['Dashboards', 'Alerts', 'MES / ERP'] },
];

/**
 * Indicative per-layer latency budget (ms) for one reading travelling the
 * sensor -> application path. Network dominates (wireless hop + uplink); the
 * fixed sum is the pipeline's end-to-end floor. These are typical IIoT orders.
 */
export const LAYER_LATENCY_MS = {
  sensing: 2, // acquire and digitise the signal
  network: 22, // wireless hop to gateway plus uplink
  processing: 14, // edge / cloud filtering and analytics
  application: 8, // dashboard update / decision
};

/** Industry Evolution Timeline widget. Dates & facts from Wikipedia (Fourth Industrial Revolution / Industrial Revolution). */
export const INDUSTRY_STAGES = [
  { id: 'i1', label: 'Industry 1.0', year: '1760-1840', title: 'Mechanization', driver: 'Steam & water power', description: 'Britain\'s steam and water power mechanized textile mills and iron making, the first shift from hand production to machines.' },
  { id: 'i2', label: 'Industry 2.0', year: '1871-1914', title: 'Mass Production', driver: 'Electricity & assembly line', description: 'Electrification and the moving assembly line (Ford, 1913) enabled large-scale mass production and the modern production line.' },
  { id: 'i3', label: 'Industry 3.0', year: '~1969', title: 'Automation', driver: 'Electronics, IT & PLCs', description: 'The digital revolution: electronics, computers and the first PLC (Modicon 084, 1968) automated individual machines.' },
  { id: 'i4', label: 'Industry 4.0', year: '2011', title: 'Cyber-Physical Systems', driver: 'IIoT, data, AI & twins', description: 'Term coined at Hannover Messe, Germany (2011) and popularized by Klaus Schwab / WEF (2016). Connected cyber-physical systems, IIoT and AI make the whole factory data-driven.' },
  { id: 'i5', label: 'Industry 5.0', year: 'emerging', title: 'Human-Centric & Sustainable', driver: 'Humans + cobots, green', description: 'An emerging EU-driven vision: shifting focus from pure efficiency toward human-centricity, resilience and sustainability, with people and collaborative robots working together.' },
];

/** RAMI 4.0 Explorer widget: three axes, each with explorable items. */
export const RAMI_AXES = [
  {
    id: 'layers',
    name: 'Layers',
    caption: 'Six functional layers, from the physical asset up to business processes.',
    items: [
      { id: 'business', name: 'Business', detail: 'Business processes, rules and commercial context.' },
      { id: 'functional', name: 'Functional', detail: 'The functions and services an asset provides at runtime.' },
      { id: 'information', name: 'Information', detail: 'Data, events and the information models exchanged.' },
      { id: 'communication', name: 'Communication', detail: 'Standardized data exchange to the integration layer.' },
      { id: 'integration', name: 'Integration', detail: 'The bridge from physical to digital (sensors, HMIs).' },
      { id: 'asset', name: 'Asset', detail: 'The real physical thing: machines, parts, documents.' },
    ],
  },
  {
    id: 'lifecycle',
    name: 'Life Cycle',
    caption: 'How an asset moves from a "Type" (design) to an "Instance" (built & used), per IEC 62890.',
    items: [
      { id: 'type-dev', name: 'Type · Development', detail: 'Design and engineering of the product/asset type.' },
      { id: 'type-maint', name: 'Type · Maintenance', detail: 'Updates and improvements to the type over time.' },
      { id: 'inst-prod', name: 'Instance · Production', detail: 'A specific unit is manufactured from the type.' },
      { id: 'inst-use', name: 'Instance · Usage', detail: 'The built instance is operated and serviced in the field.' },
    ],
  },
  {
    id: 'hierarchy',
    name: 'Hierarchy',
    caption: 'Where an asset sits in the plant; extends IEC 62264 up to the "Connected World".',
    items: [
      { id: 'product', name: 'Product', detail: 'The work piece / product being made.' },
      { id: 'field', name: 'Field Device', detail: 'Intelligent sensors and actuators.' },
      { id: 'control', name: 'Control Device', detail: 'PLCs / controllers running machine logic.' },
      { id: 'station', name: 'Station', detail: 'A machine or cell of several control devices.' },
      { id: 'workcenter', name: 'Work Centers', detail: 'A production line or plant area.' },
      { id: 'enterprise', name: 'Enterprise', detail: 'The whole company (ERP, business systems).' },
      { id: 'world', name: 'Connected World', detail: 'Collaboration across companies and value networks.' },
    ],
  },
];

/** ISA-95 Pyramid widget: level 0 (bottom) to 4 (top). */
export const ISA95_LEVELS = [
  { level: 4, name: 'Business Planning', system: 'ERP', timescale: 'Months to weeks', detail: 'Enterprise planning: orders, scheduling, procurement and logistics.' },
  { level: 3, name: 'Manufacturing Ops', system: 'MES', timescale: 'Days to shifts', detail: 'Production tracking, quality, recipes and dispatching.' },
  { level: 2, name: 'Supervisory Control', system: 'SCADA / HMI', timescale: 'Seconds', detail: 'Supervising and monitoring the process; operators use HMIs.' },
  { level: 1, name: 'Sensing & Control', system: 'PLC / DCS', timescale: 'Milliseconds', detail: 'Controllers read sensors and drive actuators in real time.' },
  { level: 0, name: 'Physical Process', system: 'Field', timescale: 'Continuous', detail: 'The actual production process: motors, valves, the machine.' },
];

/** IoT vs IIoT Comparator widget. */
export const IOT_COMPARISON = [
  { dimension: 'Focus', iot: 'Consumer convenience', iiot: 'Industrial operations' },
  { dimension: 'Environment', iot: 'Homes / offices', iiot: 'Harsh: heat, vibration, dust' },
  { dimension: 'Reliability', iot: 'Best-effort', iiot: 'Mission-critical' },
  { dimension: 'Latency', iot: 'Tolerant', iiot: 'Often real-time' },
  { dimension: 'Failure impact', iot: 'Inconvenience', iiot: 'Safety, downtime, damage' },
  { dimension: 'Lifecycle', iot: '2-5 years', iiot: '10-20+ years' },
];

/** Short explainers for the per-layer technology chips (click a chip to learn it). */
export const TECH_INFO = {
  'Temperature sensor': 'Measures process heat with RTDs, thermocouples or thermistors and feeds the sensing layer.',
  'Actuator / relay': 'Turns decisions into action: switches motors, valves and contactors on and off.',
  'RFID tag': 'Radio-frequency ID tags identify and track objects wirelessly at the sensing layer.',
  'Wi-Fi / Zigbee': 'Common IoT wireless links: Wi-Fi for bandwidth, Zigbee/LoRaWAN for low-power mesh.',
  'MQTT': 'Lightweight publish/subscribe messaging, the default protocol for IoT telemetry over TCP.',
  'Gateway / router': 'Aggregates device data and routes it onto the network toward the cloud.',
  'Edge filtering': 'Cleans and thins raw data near the machine so only useful signals travel upstream.',
  'Cloud analytics': 'Aggregates plant-wide data for storage, dashboards and large-scale analytics.',
  'ML / anomaly detection': 'Machine-learning models spot abnormal patterns to predict faults early.',
  'Dashboards': 'Visualise KPIs and live status so operators and managers can act fast.',
  'Alerts': 'Notify the right people (SMS, email, ticket) when something needs attention.',
  'MES / ERP': 'Business systems: MES runs the shop floor; ERP plans orders, inventory and logistics.',
};

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'Which industrial revolution introduced programmable automation with PLCs?',
    options: [
      { id: 'a', label: 'Industry 1.0' },
      { id: 'b', label: 'Industry 3.0' },
      { id: 'c', label: 'Industry 4.0' },
    ],
    answerId: 'b',
    explanation: 'Industry 3.0 (~1969) brought electronics, computers and PLCs; Industry 4.0 then connected them.',
  },
  {
    id: 'q2',
    prompt: 'In the IoT architecture, which layer analyses and filters the raw sensor data?',
    options: [
      { id: 'a', label: 'Application Layer' },
      { id: 'b', label: 'Network Layer' },
      { id: 'c', label: 'Data Processing Layer' },
    ],
    answerId: 'c',
    explanation: 'The Data Processing layer (edge + cloud) cleans, filters and analyses the data before the application layer uses it.',
  },
  {
    id: 'q3',
    prompt: "On RAMI 4.0's Layers axis, which layer is the physical thing itself?",
    options: [
      { id: 'a', label: 'Business layer' },
      { id: 'b', label: 'Asset layer' },
      { id: 'c', label: 'Information layer' },
    ],
    answerId: 'b',
    explanation: 'The Asset layer at the bottom is the real physical thing; Business sits at the top.',
  },
];
