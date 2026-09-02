/**
 * modules.js
 * ----------
 * The list of module tools shown in the top selector. Each module is an
 * individual full-screen interactive tool. `status: 'ready'` tools are built;
 * others show a "coming soon" panel until their tool is added.
 */

export const MODULES = [
  { id: 1, slug: 'foundations', name: 'Foundations', tagline: 'Smart Factory & IoT architecture', accent: '#22d3ee', status: 'ready' },
  { id: 2, slug: 'sensors', name: 'Sensors', tagline: 'Sensing the physical world', accent: '#34d399', status: 'ready' },
  { id: 3, slug: 'communication', name: 'Communication', tagline: 'MQTT & industrial networks', accent: '#38bdf8', status: 'ready' },
  { id: 4, slug: 'edge-ai', name: 'Edge AI', tagline: 'Edge vs cloud inference', accent: '#a78bfa', status: 'ready' },
  { id: 5, slug: 'digital-twin', name: 'Digital Twin', tagline: 'Live physical-digital sync', accent: '#818cf8', status: 'ready' },
  { id: 6, slug: 'plc-scada', name: 'PLC & SCADA', tagline: 'Automation & control', accent: '#fbbf24', status: 'ready' },
  { id: 7, slug: 'predictive-maintenance', name: 'Predictive Maintenance', tagline: 'Machine health & RUL', accent: '#fb7185', status: 'ready' },
  { id: 8, slug: 'cybersecurity', name: 'Cybersecurity', tagline: 'OT defence in depth', accent: '#2dd4bf', status: 'ready' },
  { id: 9, slug: 'robotics', name: 'Robotics', tagline: 'Robot cells & motion', accent: '#fb923c', status: 'ready' },
  { id: 10, slug: 'capstone', name: 'Capstone', tagline: 'Design a full factory', accent: '#22d3ee', status: 'ready' },
];

export function getModule(slug) {
  return MODULES.find((m) => m.slug === slug) ?? MODULES[0];
}
