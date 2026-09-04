import SteadyTwin from '../../illus/SteadyTwin';
import CyberFigure from '../../illus/cybersecurity/CyberFigure';
import { CYBER_SPEC } from '../../illus/cybersecurity/spec';
import { evaluate } from '../../illus/cybersecurity/model';

export default function CybersecurityTwin() {
  return <SteadyTwin spec={CYBER_SPEC} evaluate={evaluate} Figure={CyberFigure} tip="Weaken patching, firewalls or segmentation and watch residual risk climb. Trip 'flat network' to see why segmentation matters — one foothold suddenly reaches every zone." />;
}
