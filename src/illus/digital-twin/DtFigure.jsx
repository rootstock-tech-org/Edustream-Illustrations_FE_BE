import BlockFigure from '../BlockFigure';

const STAGES = [
  { label: 'Physical asset', sub: 'the real thing' },
  { label: 'Sensor', sub: 'simulated today' },
  { label: 'Digital twin', sub: 'model of record', stateTag: 'DEV' },
  { label: 'Dashboard', sub: 'predicted vs measured' },
];

export default function DtFigure(props) {
  return <BlockFigure {...props} stages={STAGES} flowLabel="measurement feeds the twin; the twin predicts; deviation shows the gap" />;
}
