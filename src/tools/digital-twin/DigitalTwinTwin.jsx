import SteadyTwin from '../../illus/SteadyTwin';
import DtFigure from '../../illus/digital-twin/DtFigure';
import { DT_SPEC } from '../../illus/digital-twin/spec';
import { evaluate } from '../../illus/digital-twin/model';

export default function DigitalTwinTwin() {
  return <SteadyTwin spec={DT_SPEC} evaluate={evaluate} Figure={DtFigure} tip="Inject sensor drift or unmodelled wear — the measurement pulls away from the twin, deviation rises and sync confidence drops. That gap is when a twin earns its keep." />;
}
