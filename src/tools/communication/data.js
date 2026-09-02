/**
 * data.js (Communication tool)
 * ----------------------------
 * Researched content for the industrial-communication tool: an MQTT pub/sub
 * network, protocol facts, QoS levels, topologies and questions.
 * Sources: Wikipedia MQTT (OASIS/ISO 20922), OPC UA (IEC 62541), Modbus.
 */

/** Nodes on the simulated MQTT network. `pos` is a 3D marker position. */
export const NODES = [
  { id: 'temp', role: 'publisher', name: 'Temp sensor', topic: 'line1/temp', pos: [-3.2, 0.6, 1.5], detail: 'A publisher: sends temperature readings to its topic. It does not know or care which clients are listening.' },
  { id: 'vibe', role: 'publisher', name: 'Vibration sensor', topic: 'line1/vibration', pos: [-3.2, 0.6, -1.5], detail: 'A publisher: streams vibration data. The broker fans each message out to every subscriber of the topic.' },
  { id: 'broker', role: 'broker', name: 'MQTT Broker', topic: '#', pos: [0, 1.5, 0], detail: 'The post office. It receives every PUBLISH and routes a copy to each client subscribed to that topic, decoupling publishers from subscribers. Default port 1883 (8883 with TLS).' },
  { id: 'dash', role: 'subscriber', name: 'Dashboard', topic: 'line1/#', pos: [3.2, 0.6, 1.5], detail: 'A subscriber: receives the line topics from the broker and visualises the live values.' },
  { id: 'db', role: 'subscriber', name: 'Historian DB', topic: '#', pos: [3.2, 0.6, -1.5], detail: 'A subscriber: subscribes to everything and stores it for later analytics.' },
];

/** Steady-state network stats for the current controls. */
export function computeStats({ rate, qos, loss }) {
  const publishers = NODES.filter((n) => n.role === 'publisher').length;
  const subscribers = NODES.filter((n) => n.role === 'subscriber').length;
  const offered = rate * publishers; // messages published per second
  const fanout = offered * subscribers; // deliveries attempted (fan-out)
  // Higher QoS re-sends lost messages, so effective loss falls as QoS rises.
  const effLoss = qos === 0 ? loss : qos === 1 ? loss * 0.2 : loss * 0.02;
  const delivered = fanout * (1 - effLoss / 100);
  const baseLatency = 6 + rate * 1.4; // network + congestion
  const qosLatency = qos === 0 ? 0 : qos === 1 ? 18 : 45; // handshake overhead
  return {
    offered,
    delivered: Math.round(delivered),
    lost: Math.round(fanout - delivered),
    latency: Math.round(baseLatency + qosLatency),
  };
}

/** Protocol recommender: requirements + candidates. Facts are researched. */
export const PROTO_REQUIREMENTS = [
  { id: 'light', label: 'Lightweight' },
  { id: 'pubsub', label: 'Pub/Sub' },
  { id: 'many', label: 'Many devices' },
  { id: 'models', label: 'Rich data models' },
  { id: 'reqres', label: 'Request / Response' },
  { id: 'constrained', label: 'Constrained / UDP' },
];
export const PROTOCOLS = [
  { id: 'mqtt', name: 'MQTT', note: 'Lightweight publish/subscribe over TCP (port 1883, 8883 with TLS). A broker fans messages out by topic. The default choice for IoT telemetry.', fits: ['light', 'pubsub', 'many'] },
  { id: 'opcua', name: 'OPC UA', note: 'Cross-platform IEC 62541 standard with rich standardised information models and strong security. Supports both client-server and pub/sub.', fits: ['pubsub', 'models', 'reqres', 'many'] },
  { id: 'modbus', name: 'Modbus', note: 'Simple client/server fieldbus. RTU over RS-485 serial or TCP on port 502. A master polls up to 247 devices; no built-in security.', fits: ['reqres'] },
  { id: 'http', name: 'HTTP / REST', note: 'Ubiquitous request/response over TCP; easy for web and cloud APIs but heavier per message than MQTT.', fits: ['reqres', 'models'] },
  { id: 'coap', name: 'CoAP', note: 'A REST-like protocol over UDP for very constrained devices; low overhead, good for battery/limited nodes.', fits: ['light', 'constrained', 'reqres'] },
];

/** MQTT Quality-of-Service levels with their delivery handshakes. */
export const QOS_LEVELS = [
  { id: 0, name: 'QoS 0 · At most once', tag: 'Fire & forget', detail: 'The message is sent once with no acknowledgement. Fastest and lightest, but a lost message is simply gone.', steps: ['PUBLISH →'] },
  { id: 1, name: 'QoS 1 · At least once', tag: 'Acknowledged', detail: 'The sender re-sends until it gets a PUBACK, so delivery is guaranteed, but duplicates are possible.', steps: ['PUBLISH →', '← PUBACK'] },
  { id: 2, name: 'QoS 2 · Exactly once', tag: 'Assured', detail: 'A four-part handshake (PUBLISH / PUBREC / PUBREL / PUBCOMP) ensures the message arrives exactly once. Safest, highest overhead.', steps: ['PUBLISH →', '← PUBREC', 'PUBREL →', '← PUBCOMP'] },
];

/** What each MQTT control packet in the handshakes means (click a step chip). */
export const PACKET_INFO = {
  PUBLISH: 'Carries the actual application message: the topic name plus the payload, sent from the publisher to the broker (and on to subscribers).',
  PUBACK: 'QoS 1 acknowledgement. It confirms the PUBLISH was received, so the sender can stop re-sending that message.',
  PUBREC: 'QoS 2 step 1, "publish received". The receiver tells the sender the message arrived, starting the four-way handshake.',
  PUBREL: 'QoS 2 step 2, "publish release". The sender confirms, giving the receiver the go-ahead to deliver the message just once.',
  PUBCOMP: 'QoS 2 final step, "publish complete". The handshake is finished and the message is guaranteed delivered exactly once.',
};

/** Network topologies. */
export const TOPOLOGIES = [
  { id: 'star', name: 'Star', detail: 'Every device connects to a central switch or hub. Simple and the norm in Ethernet, but the hub is a single point of failure.', pro: 'Easy to manage', con: 'Hub = single point of failure' },
  { id: 'bus', name: 'Bus', detail: 'All devices share one backbone cable (e.g. RS-485 / Modbus). Cheap and few wires, but one cable fault can take down the whole segment.', pro: 'Low cost, few wires', con: 'One break affects all' },
  { id: 'ring', name: 'Ring', detail: 'Each node links to two neighbours forming a loop. Industrial rings (PROFINET, EtherCAT) add redundancy so traffic can flow both ways.', pro: 'Redundant paths', con: 'A break must heal fast' },
  { id: 'mesh', name: 'Mesh', detail: 'Nodes interconnect with multiple paths (e.g. Zigbee). Self-healing and resilient, but routing is more complex.', pro: 'Resilient, self-healing', con: 'More complex routing' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'In MQTT, which component routes messages from publishers to subscribers?',
    options: [
      { id: 'a', label: 'The publisher' },
      { id: 'b', label: 'The broker' },
      { id: 'c', label: 'The subscriber' },
    ],
    answerId: 'b',
    explanation: 'The broker receives every publish and delivers a copy to each client subscribed to that topic.',
  },
  {
    id: 'q2',
    prompt: 'Which MQTT QoS level guarantees a message is delivered exactly once?',
    options: [
      { id: 'a', label: 'QoS 0' },
      { id: 'b', label: 'QoS 1' },
      { id: 'c', label: 'QoS 2' },
    ],
    answerId: 'c',
    explanation: 'QoS 2 uses a four-step handshake (PUBLISH/PUBREC/PUBREL/PUBCOMP) for exactly-once delivery.',
  },
  {
    id: 'q3',
    prompt: 'Modbus uses which communication model?',
    options: [
      { id: 'a', label: 'Publish / subscribe' },
      { id: 'b', label: 'Client / server: a master polls the devices' },
      { id: 'c', label: 'Peer-to-peer broadcast' },
    ],
    answerId: 'b',
    explanation: 'Modbus is client/server (formerly master/slave): the master polls each device; devices never speak on their own.',
  },
  {
    id: 'q4',
    prompt: 'A plant has 600 battery-powered wireless sensors sending tiny telemetry over a patchy link to a dashboard and a historian. Which protocol fits best?',
    options: [
      { id: 'a', label: 'Modbus' },
      { id: 'b', label: 'MQTT' },
      { id: 'c', label: 'HTTP / REST' },
    ],
    answerId: 'b',
    explanation: 'Lightweight MQTT pub/sub fans each reading out to both consumers via a broker, tolerates a flaky link with QoS and scales to hundreds of low-power publishers.',
  },
];

/** Protocol Comparator: dimensions compared side by side. */
export const COMPARE_DIMS = [
  { id: 'model', label: 'Comm. model' },
  { id: 'transport', label: 'Transport / port' },
  { id: 'security', label: 'Security' },
  { id: 'overhead', label: 'Per-message overhead' },
  { id: 'data', label: 'Data model' },
  { id: 'bestfor', label: 'Best for' },
];

/** Protocol Comparator + Challenge: researched facts per protocol. */
export const COMPARE_PROTOCOLS = {
  mqtt: { name: 'MQTT', model: 'Publish / subscribe via broker', transport: 'TCP 1883 (8883 TLS)', security: 'TLS + username / password', overhead: 'Very low, 2-byte fixed header', data: 'Free-form topic strings + payload', bestfor: 'IoT telemetry, many-to-many fan-out' },
  opcua: { name: 'OPC UA', model: 'Client / server + pub / sub', transport: 'TCP 4840 (or HTTPS)', security: 'Built-in certificates, signing & encryption', overhead: 'Higher, richly encoded messages', data: 'Standardised information models', bestfor: 'Interoperable machine-to-machine data' },
  modbus: { name: 'Modbus', model: 'Client / server (master polls)', transport: 'RS-485 serial or TCP 502', security: 'None (needs VPN / gateway)', overhead: 'Tiny, simple register frames', data: 'Raw registers / coils', bestfor: 'Simple PLC & field-device polling' },
  http: { name: 'HTTP / REST', model: 'Request / response', transport: 'TCP 80 / 443', security: 'TLS (HTTPS)', overhead: 'High, text headers per request', data: 'JSON / XML resources', bestfor: 'Cloud & web APIs, config calls' },
  coap: { name: 'CoAP', model: 'Request / response (REST-like)', transport: 'UDP 5683', security: 'DTLS', overhead: 'Very low, binary', data: 'Resources (URIs)', bestfor: 'Very constrained / battery devices' },
};

/** MQTT Topic Builder: hierarchical topic levels (ISA-95-style naming) with options. */
export const TOPIC_LEVELS = [
  { id: 'site', label: 'Site', options: ['plant1', 'plant2', 'hyderabad'] },
  { id: 'area', label: 'Area', options: ['assembly', 'packaging', 'utilities'] },
  { id: 'line', label: 'Line', options: ['line1', 'line2', 'line3'] },
  { id: 'asset', label: 'Asset', options: ['motor', 'pump', 'robot', 'conveyor'] },
  { id: 'metric', label: 'Metric', options: ['temp', 'vibration', 'current', 'status'] },
];

/** Latency Estimator: link types with a one-way base latency (ms). */
export const LATENCY_LINKS = [
  { id: 'lan', name: 'Wired LAN', base: 1, note: 'Switched industrial Ethernet.' },
  { id: 'wifi', name: 'Wi-Fi', base: 8, note: 'Shared medium, some contention.' },
  { id: 'cell', name: '4G / LTE', base: 45, note: 'Cellular, variable jitter.' },
  { id: 'sat', name: 'Satellite', base: 600, note: 'Geostationary round-trip.' },
];

/**
 * Latency model (illustrative): link base + extra hops + payload serialisation +
 * QoS handshake round-trips. Numbers are teaching estimates, not a spec.
 */
export function estimateLatency({ linkId, hops, payload, qos }) {
  const link = LATENCY_LINKS.find((l) => l.id === linkId) ?? LATENCY_LINKS[0];
  const network = link.base + hops * link.base * 0.5;
  const serialise = payload / 200; // ~200 bytes/ms on the wire (illustrative)
  const qosOverhead = qos === 0 ? 0 : qos === 1 ? link.base * 1.5 : link.base * 3.5;
  const total = network + serialise + qosOverhead;
  return {
    link,
    network: Math.round(network),
    serialise: Math.round(serialise),
    qosOverhead: Math.round(qosOverhead),
    total: Math.round(total),
  };
}

/** Engineering Challenge: pick the optimal protocol for this plant. */
export const COMM_CHALLENGE = {
  brief: 'A packaging plant has 600 battery-powered wireless sensors sending tiny telemetry every few seconds over a patchy Wi-Fi link, feeding one live dashboard and a historian database.',
  answer: 'mqtt',
  options: ['mqtt', 'opcua', 'modbus', 'http', 'coap'],
  why: {
    mqtt: 'Correct. Lightweight pub/sub through a broker fans each reading out to both the dashboard and the historian, rides out a flaky link with QoS, and scales to hundreds of publishers.',
    opcua: 'Overkill here: rich information models and heavier messages suit machine interoperability, not hundreds of tiny battery-powered telemetry nodes.',
    modbus: 'Wrong model: Modbus is master-polled client/server with no pub/sub and no security, a poor fit for many wireless publishers.',
    http: 'Too heavy: a full request/response with text headers per reading drains batteries and does not fan out to multiple consumers.',
    coap: 'Close, but not ideal: CoAP is light and great for constrained nodes, yet it is request/response, so fanning out to a dashboard AND a historian needs extra work a broker gives you for free.',
  },
};
