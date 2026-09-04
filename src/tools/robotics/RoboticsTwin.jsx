import SteadyTwin from '../../illus/SteadyTwin';
import RoboFigure from '../../illus/robotics/RoboFigure';
import { ROBO_SPEC } from '../../illus/robotics/spec';
import { evaluate } from '../../illus/robotics/model';

export default function RoboticsTwin() {
  return <SteadyTwin spec={ROBO_SPEC} evaluate={evaluate} Figure={RoboFigure} tip="Sweep the joints and watch the end-effector trace the workspace; add payload and the shoulder torque climbs fastest when the arm is stretched out horizontally." />;
}
