import SteadyTwin from '../../illus/SteadyTwin';
import CapstoneFigure from '../../illus/capstone/CapstoneFigure';
import { CAPSTONE_SPEC } from '../../illus/capstone/spec';
import { evaluate } from '../../illus/capstone/model';

export default function CapstoneTwin() {
  return <SteadyTwin spec={CAPSTONE_SPEC} evaluate={evaluate} Figure={CapstoneFigure} tip="One line, one number. Push cycle time, downtime or scrap and watch OEE fall — then trip a fault to see which of Availability, Performance or Quality took the hit." />;
}
