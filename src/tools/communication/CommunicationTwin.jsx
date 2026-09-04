import SteadyTwin from '../../illus/SteadyTwin';
import CommFigure from '../../illus/communication/CommFigure';
import { COMM_SPEC } from '../../illus/communication/spec';
import { evaluate } from '../../illus/communication/model';

export default function CommunicationTwin() {
  return <SteadyTwin spec={COMM_SPEC} evaluate={evaluate} Figure={CommFigure} tip="Push the message rate up or degrade the link — latency stays flat until ~85% utilisation, then climbs steeply and packets drop." />;
}
