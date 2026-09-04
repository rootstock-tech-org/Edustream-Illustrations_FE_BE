/*
 * Robotics — pure model (Rulebook §2.1). A 2-link planar arm: forward kinematics
 * for the end-effector position and static gravity-holding torque at each joint.
 * Deterministic — no Math.random / no wall-clock. Lengths are exported so the
 * figure can draw the true-proportion arm from the same angles (§5.10).
 */
export const L1 = 1.0; // m, shoulder link
export const L2 = 0.8; // m, forearm link
const M1 = 3.0, M2 = 2.0, G = 9.81; // link masses (kg), gravity
export const NAMEPLATE = { theta1: 45, theta2: 30, payload: 2 };

export function evaluate(params, faults = {}) {
  const t1 = (clamp(params.theta1, 0, 180) * Math.PI) / 180;
  const t2 = (clamp(params.theta2, -150, 150) * Math.PI) / 180;
  const mp = clamp(params.payload, 0, 10) * (faults.overload ? 2 : 1);
  const stiction = faults.stiction ? 6 : 0;

  const ex = L1 * Math.cos(t1) + L2 * Math.cos(t1 + t2);
  const ey = L1 * Math.sin(t1) + L2 * Math.sin(t1 + t2);

  // static holding torque = gravity moment (horizontal arm) about each joint
  const tau2 = G * (M2 * (L2 / 2) * Math.cos(t1 + t2) + mp * L2 * Math.cos(t1 + t2)) + stiction;
  const tau1 = G * (M1 * (L1 / 2) * Math.cos(t1) + M2 * (L1 * Math.cos(t1) + (L2 / 2) * Math.cos(t1 + t2)) + mp * ex) + stiction;

  return {
    eeX: { si: ex, unit: 'm', explanation: { formulaId: 'eeX', title: 'End-effector X', latex: 'x = L_1\\cos\\theta_1 + L_2\\cos(\\theta_1+\\theta_2)', steps: [['L1·cosθ1', `${(L1 * Math.cos(t1)).toFixed(2)} m`], ['L2·cos(θ1+θ2)', `${(L2 * Math.cos(t1 + t2)).toFixed(2)} m`], ['x', `${ex.toFixed(2)} m`]], result: `${ex.toFixed(2)} m`, assumptions: ['Rigid links, planar arm, base at origin.'] } },
    eeY: { si: ey, unit: 'm', explanation: { formulaId: 'eeY', title: 'End-effector Y', latex: 'y = L_1\\sin\\theta_1 + L_2\\sin(\\theta_1+\\theta_2)', steps: [['L1·sinθ1', `${(L1 * Math.sin(t1)).toFixed(2)} m`], ['L2·sin(θ1+θ2)', `${(L2 * Math.sin(t1 + t2)).toFixed(2)} m`], ['y', `${ey.toFixed(2)} m`]], result: `${ey.toFixed(2)} m`, assumptions: ['Height above the shoulder axis.'] } },
    tau1: { si: tau1, unit: 'N.m', explanation: { formulaId: 'tau1', title: 'Shoulder torque', latex: '\\tau_1 = g\\,[\\,m_1\\tfrac{L_1}{2}\\cos\\theta_1 + m_2(\\ldots) + m_p\\,x\\,]', steps: [['payload', `${mp.toFixed(1)} kg`], ['reach x', `${ex.toFixed(2)} m`], ['τ1', `${tau1.toFixed(1)} N·m`]], result: `${tau1.toFixed(1)} N·m`, assumptions: ['Static holding torque (no acceleration).', 'Gravity acts down; horizontal moment arm.'] } },
    tau2: { si: tau2, unit: 'N.m', explanation: { formulaId: 'tau2', title: 'Elbow torque', latex: '\\tau_2 = g\\,[\\,m_2\\tfrac{L_2}{2}\\cos(\\theta_1+\\theta_2) + m_p L_2\\cos(\\theta_1+\\theta_2)\\,]', steps: [['payload', `${mp.toFixed(1)} kg`], ['forearm angle', `${((t1 + t2) * 180 / Math.PI).toFixed(0)}°`], ['τ2', `${tau2.toFixed(1)} N·m`]], result: `${tau2.toFixed(1)} N·m`, assumptions: ['Static holding torque about the elbow.'] } },
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export const MODEL = { id: 'planar-2link-arm', version: '1.0' };
