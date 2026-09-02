/**
 * data.js (Robotics tool)
 * -----------------------
 * Content for a 6-axis articulated robot cell. The arm geometry and link
 * lengths are reused from the standalone robot-arm demo, plus a forward-
 * kinematics helper, robot types, kinematics concepts and safety.
 * Sources: Wikipedia Industrial robot (six types, axes/DOF, kinematics,
 * end-effector, work envelope, ISO 8373 vocabulary).
 */

/** Arm link lengths (world units): single source of truth for geometry + FK. */
export const LINK = {
  SHOULDER_PIVOT_Y: 0.4,
  UPPER_ARM: 2.0,
  FOREARM: 1.7,
  WRIST_ROLL_OFFSET: 0.28,
  WRIST_TO_GRASP: 0.6,
};

/** Neutral rest pose (radians; gripper 0 closed .. 1 open). */
export const HOME_POSE = { base: 0, shoulder: -0.3, elbow: 1.0, wristPitch: 0.5, wristRoll: 0, gripper: 1 };

/** The six controllable joints (5 rotary axes + gripper) with limits in radians. */
export const JOINTS = [
  { id: 'base', label: 'J1 · Base', axis: 'Yaw · Y', min: -2.8, max: 2.8 },
  { id: 'shoulder', label: 'J2 · Shoulder', axis: 'Pitch · X', min: -1.2, max: 1.4 },
  { id: 'elbow', label: 'J3 · Elbow', axis: 'Pitch · X', min: -0.4, max: 2.2 },
  { id: 'wristPitch', label: 'J4 · Wrist pitch', axis: 'Pitch · X', min: -1.7, max: 1.7 },
  { id: 'wristRoll', label: 'J5 · Wrist roll', axis: 'Roll · Y', min: -3.1, max: 3.1 },
  { id: 'gripper', label: 'J6 · Gripper', axis: 'Open / close', min: 0, max: 1 },
];

/**
 * Forward kinematics: joint angles -> world position of the grasp point.
 * The three pitch joints are cumulative about X; the base yaws the whole plane.
 */
export function forwardKinematics(pose) {
  const { UPPER_ARM, FOREARM, WRIST_ROLL_OFFSET, WRIST_TO_GRASP, SHOULDER_PIVOT_Y } = LINK;
  const a2 = pose.shoulder;
  const a23 = pose.shoulder + pose.elbow;
  const a234 = a23 + pose.wristPitch;
  const tool = WRIST_ROLL_OFFSET + WRIST_TO_GRASP;
  const y = SHOULDER_PIVOT_Y + UPPER_ARM * Math.cos(a2) + FOREARM * Math.cos(a23) + tool * Math.cos(a234);
  const r = UPPER_ARM * Math.sin(a2) + FOREARM * Math.sin(a23) + tool * Math.sin(a234);
  const x = r * Math.sin(pose.base);
  const z = r * Math.cos(pose.base);
  return { x, y, z, reach: Math.sqrt(x * x + y * y + z * z) };
}

/** Keys used for generic pose interpolation. */
const POSE_KEYS = ['base', 'shoulder', 'elbow', 'wristPitch', 'wristRoll', 'gripper'];

/** Progress points where the gripper grips and releases the block. */
export const GRIP_CLOSE_T = 0.36;
export const RELEASE_T = 0.88;

/** Pick -> lift -> place -> home cycle as ordered keyframes (progress 0..1). */
const KEYFRAMES = [
  { t: 0.0, pose: { base: 0.0, shoulder: -0.3, elbow: 1.0, wristPitch: 0.5, wristRoll: 0, gripper: 1 } },
  { t: 0.15, pose: { base: 0.6, shoulder: 0.5, elbow: 1.0, wristPitch: 0.6, wristRoll: 0, gripper: 1 } },
  { t: 0.28, pose: { base: 0.6, shoulder: 0.8, elbow: 1.1, wristPitch: 0.7, wristRoll: 0, gripper: 1 } },
  { t: 0.36, pose: { base: 0.6, shoulder: 0.8, elbow: 1.1, wristPitch: 0.7, wristRoll: 0, gripper: 0 } },
  { t: 0.5, pose: { base: 0.6, shoulder: 0.35, elbow: 0.9, wristPitch: 0.55, wristRoll: 0, gripper: 0 } },
  { t: 0.64, pose: { base: -0.8, shoulder: 0.35, elbow: 0.9, wristPitch: 0.55, wristRoll: 0, gripper: 0 } },
  { t: 0.78, pose: { base: -0.8, shoulder: 0.8, elbow: 1.1, wristPitch: 0.7, wristRoll: 0, gripper: 0 } },
  { t: 0.88, pose: { base: -0.8, shoulder: 0.8, elbow: 1.1, wristPitch: 0.7, wristRoll: 0, gripper: 1 } },
  { t: 1.0, pose: { base: 0.0, shoulder: -0.3, elbow: 1.0, wristPitch: 0.5, wristRoll: 0, gripper: 1 } },
];

/** The grip-close and release poses, used to place the pick/place stands. */
export const PICK_POSE = KEYFRAMES[3].pose;
export const PLACE_POSE = KEYFRAMES[7].pose;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** Pose at any cycle progress (eased between keyframes). */
export function getPoseAtProgress(progress) {
  const p = clamp01(progress);
  if (p <= 0) return { ...KEYFRAMES[0].pose };
  if (p >= 1) return { ...KEYFRAMES[KEYFRAMES.length - 1].pose };
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const k0 = KEYFRAMES[i];
    const k1 = KEYFRAMES[i + 1];
    if (p >= k0.t && p <= k1.t) {
      const lt = smooth((p - k0.t) / (k1.t - k0.t || 1));
      const out = {};
      for (const k of POSE_KEYS) out[k] = k0.pose[k] + (k1.pose[k] - k0.pose[k]) * lt;
      return out;
    }
  }
  return { ...KEYFRAMES[KEYFRAMES.length - 1].pose };
}

/** World point on the tool axis, `reach` units up from the wrist pivot (the grasp point). */
export function getToolPointWorld(pose, reach) {
  const { SHOULDER_PIVOT_Y, UPPER_ARM, FOREARM } = LINK;
  const a1 = pose.shoulder;
  const a2 = pose.shoulder + pose.elbow;
  const a3 = a2 + pose.wristPitch;
  const y = SHOULDER_PIVOT_Y + UPPER_ARM * Math.cos(a1) + FOREARM * Math.cos(a2) + reach * Math.cos(a3);
  const zl = UPPER_ARM * Math.sin(a1) + FOREARM * Math.sin(a2) + reach * Math.sin(a3);
  return [zl * Math.sin(pose.base), y, zl * Math.cos(pose.base)];
}

/** The six industrial robot types by kinematic structure (Wikipedia / ISO 8373).
 *  Note: a cobot is a collaboration class, not a structure, so it is covered under Safety. */
export const ROBOT_TYPES = [
  { id: 'articulated', name: 'Articulated', dof: '6 DOF', detail: 'The most common industrial robot: an arm of rotary joints, like a human arm. Flexible for welding, assembly and handling.' },
  { id: 'scara', name: 'SCARA', dof: '4 DOF', detail: 'Selective Compliance Assembly Robot Arm: two parallel joints move in the X-Y plane. Fast and precise for assembly and pick-and-place.' },
  { id: 'delta', name: 'Delta', dof: '3 DOF', detail: 'A parallel-link "spider" hung above the work. Extremely fast for lightweight pick-and-place (packaging, sorting).' },
  { id: 'cartesian', name: 'Cartesian', dof: '3+ DOF', detail: 'Gantry / X-Y-Z robot: three linear (prismatic) axes. Simple, rigid and great for large, rectangular work areas.' },
  { id: 'cylindrical', name: 'Cylindrical', dof: '3-4 DOF', detail: 'A rotary base plus prismatic joints; reaches into tight, cylindrical work-spaces for machine tending.' },
  { id: 'spherical', name: 'Spherical / Polar', dof: '3+ DOF', detail: 'A rotary base and shoulder with an extending arm, working in a spherical coordinate space. One of the earliest industrial robots (the Unimate); used for machine tending, die-casting and welding.' },
];

/** Kinematics + defining parameters. */
export const KINEMATICS = [
  { id: 'dof', name: 'Degrees of freedom', detail: 'Two axes reach any point in a plane, three reach any point in space; three more (yaw, pitch, roll) orient the wrist, giving the classic 6 DOF.' },
  { id: 'forward', name: 'Forward kinematics', detail: 'Given the joint angles, compute where the end-effector is. This tool does it live from your slider values.' },
  { id: 'inverse', name: 'Inverse kinematics', detail: 'The reverse: given a target X-Y-Z, solve the joint angles to reach it. Harder, and there can be several solutions.' },
  { id: 'envelope', name: 'Work envelope', detail: 'The region of space the tool can reach. Points outside it are unreachable at any joint setting.' },
  { id: 'repeatability', name: 'Accuracy vs repeatability', detail: 'Accuracy is how close it gets to a commanded point; repeatability is how consistently it returns to a taught point (usually the key spec, per ISO 9283).' },
  { id: 'singularity', name: 'Singularity', detail: 'A pose where axes line up and motion becomes unpredictable (a "wrist flip"); controllers slow down or route around it.' },
];

/** Common applications (end-effector driven). */
export const APPLICATIONS = [
  { id: 'welding', name: 'Welding', detail: 'A welding torch on the flange follows a continuous path with controlled speed and orientation.' },
  { id: 'assembly', name: 'Assembly', detail: 'Precise pick-and-place of parts; SCARA and articulated arms dominate here.' },
  { id: 'palletizing', name: 'Palletizing', detail: 'Stacking boxes onto pallets, repeated tirelessly with high payload.' },
  { id: 'painting', name: 'Painting', detail: 'A spray gun traces surfaces; often explosion-proof for solvent fumes.' },
  { id: 'inspection', name: 'Inspection', detail: 'A vision sensor on the arm checks parts for defects and guides grasping.' },
];

/** Robot cell safety. */
export const SAFETY = [
  { id: 'estop', name: 'Emergency stop', detail: 'A big red button (and a 3-position deadman on the teach pendant) halts motion instantly.' },
  { id: 'guarding', name: 'Guarding & interlocks', detail: 'Fences, light curtains and interlocked gates stop the robot if a person enters the cell.' },
  { id: 'cobot', name: 'Collaborative limits', detail: 'Cobots limit force and speed so contact with a person is safe, allowing fenceless operation.' },
  { id: 'cell', name: 'Work cell', detail: 'A robot plus its feeders, machines and conveyors, integrated and coordinated by one controller/PLC.' },
];

export const KNOWLEDGE_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'How many degrees of freedom does a typical articulated arm have to fully position AND orient its tool?',
    options: [
      { id: 'a', label: '3' },
      { id: 'b', label: '6' },
      { id: 'c', label: '2' },
    ],
    answerId: 'b',
    explanation: 'Three axes place the tool anywhere in space and three more (yaw, pitch, roll) orient the wrist: six DOF total.',
  },
  {
    id: 'q2',
    prompt: 'What does forward kinematics compute?',
    options: [
      { id: 'a', label: 'Joint angles needed to reach a target point' },
      { id: 'b', label: 'The end-effector position from the joint angles' },
      { id: 'c', label: 'The motor current' },
    ],
    answerId: 'b',
    explanation: 'Forward kinematics maps joint angles to the tool position; inverse kinematics does the reverse.',
  },
  {
    id: 'q3',
    prompt: 'Which robot type is best known for very fast, lightweight pick-and-place?',
    options: [
      { id: 'a', label: 'Cartesian' },
      { id: 'b', label: 'Delta' },
      { id: 'c', label: 'Cylindrical' },
    ],
    answerId: 'b',
    explanation: 'The parallel-link Delta robot is prized for extremely fast pick-and-place of light objects.',
  },
];
