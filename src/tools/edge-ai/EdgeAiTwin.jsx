import SteadyTwin from '../../illus/SteadyTwin';
import EdgeFigure from '../../illus/edge-ai/EdgeFigure';
import { EDGE_SPEC } from '../../illus/edge-ai/spec';
import { evaluate } from '../../illus/edge-ai/model';

export default function EdgeAiTwin() {
  return <SteadyTwin spec={EDGE_SPEC} evaluate={evaluate} Figure={EdgeFigure} tip="Grow the model for accuracy and watch latency, FPS and power move against it — the edge trade-off. Thermal throttle or a memory overflow makes it worse." />;
}
