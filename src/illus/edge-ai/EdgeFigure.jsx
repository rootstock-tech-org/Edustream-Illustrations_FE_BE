import BlockFigure from '../BlockFigure';

const STAGES = [
  { label: 'Capture', sub: 'camera' },
  { label: 'Preprocess', sub: 'resize / normalise' },
  { label: 'Infer', sub: 'neural network', stateTag: 'LAT' },
  { label: 'Act', sub: 'control output' },
];

export default function EdgeFigure(props) {
  return <BlockFigure {...props} stages={STAGES} flowLabel="on-device inference pipeline" />;
}
