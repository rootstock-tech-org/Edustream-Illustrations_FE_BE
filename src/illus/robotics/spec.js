/*
 * Robotics — AssetSpec (Rulebook §4, mechanical). 2-link planar arm.
 */
import { NAMEPLATE, MODEL } from './model.js';

export const ROBO_SPEC = {
  id: 'planar-2link-arm',
  name: '2-link planar robot arm',
  discipline: 'mechanical',
  standard: 'ISO 128 geometry · forward kinematics',
  view: 'orthographic',
  depth: 3,

  quantities: [
    { key: 'eeX', tag: 'X', label: 'End-effector X', unit: 'm', display: { symbol: 'm', scale: 1 }, range: [-1.8, 1.8], sigFigs: 2, anchor: 'ee', formulaId: 'eeX' },
    { key: 'eeY', tag: 'Y', label: 'End-effector Y', unit: 'm', display: { symbol: 'm', scale: 1 }, range: [-1.8, 1.8], sigFigs: 2, anchor: 'ee', formulaId: 'eeY' },
    { key: 'tau1', tag: 'T1', label: 'Shoulder torque', unit: 'N.m', display: { symbol: 'N·m', scale: 1 }, range: [0, 90], sigFigs: 3, anchor: 'j1', limits: { hi: 55, hiHi: 70 }, formulaId: 'tau1' },
    { key: 'tau2', tag: 'T2', label: 'Elbow torque', unit: 'N.m', display: { symbol: 'N·m', scale: 1 }, range: [0, 30], sigFigs: 3, anchor: 'j2', limits: { hi: 15, hiHi: 20 }, formulaId: 'tau2' },
  ],

  parameters: [
    { key: 'theta1', label: 'Shoulder θ₁', symbol: 'θ1', unit: '°', min: 0, max: 180, step: 5, nameplate: NAMEPLATE.theta1 },
    { key: 'theta2', label: 'Elbow θ₂', symbol: 'θ2', unit: '°', min: -150, max: 150, step: 5, nameplate: NAMEPLATE.theta2 },
    { key: 'payload', label: 'Payload', symbol: 'm_p', unit: 'kg', min: 0, max: 10, step: 0.5, nameplate: NAMEPLATE.payload },
  ],

  faults: [
    { id: 'overload', label: 'Payload overload (×2)', description: 'The gripped mass is twice the rating. Joint torques climb past their limits — the drives stall or trip.', affects: ['tau1', 'tau2'] },
    { id: 'stiction', label: 'Joint stiction', description: 'Added break-away friction at both joints raises the torque needed to hold position, insidiously heating the drives.', affects: ['tau1', 'tau2'] },
  ],

  assumptions: [
    'Static holding torque only — no dynamics (acceleration/inertia).',
    'Rigid links; planar arm with the base at the origin.',
    'Gravity acts downward; torque is the gravitational moment.',
  ],
  notModelled: ['Trajectory dynamics and inertia', 'Joint compliance and backlash', 'Singularities and collision avoidance'],
  model: MODEL,
};
