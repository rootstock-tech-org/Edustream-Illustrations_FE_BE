import SteadyTwin from '../../illus/SteadyTwin';
import FoundationsFigure from '../../illus/foundations/FoundationsFigure';
import { FOUND_SPEC } from '../../illus/foundations/spec';
import { evaluate } from '../../illus/foundations/model';

export default function FoundationsTwin() {
  return <SteadyTwin spec={FOUND_SPEC} evaluate={evaluate} Figure={FoundationsFigure} tip="Raise the sensor rate or processing load — the network and processing layers queue up and the end-to-end budget blows past target." />;
}
