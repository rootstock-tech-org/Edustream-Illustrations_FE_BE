/*
 * Capstone D3 figure (Rulebook §12). The integrated line as a staged pipeline;
 * OEE and its three factors read out below. Thin wrapper over BlockFigure.
 */
import BlockFigure from '../BlockFigure';
import { C, W, MEDIUM } from '../tokens';

const STAGES = [
  { label: 'Infeed', sub: 'raw stock', stateTag: 'AVL' },
  { label: 'Machining', sub: 'CNC cell', stateTag: 'PRF' },
  { label: 'Assembly', sub: 'robot cell', stateTag: 'PRF' },
  { label: 'Inspection', sub: 'vision QA', stateTag: 'QLT' },
  { label: 'Palletize', sub: 'good units', stateTag: 'OEE' },
];

export default function CapstoneFigure(props) {
  return (
    <BlockFigure
      {...props}
      stages={STAGES}
      flowLabel="material flow → good units out"
      legend={[
        { kind: 'fill', color: C.canvas, label: 'Line station' },
        { kind: 'line', color: MEDIUM.data.stroke, width: W.W2, dash: '2 3', label: 'Material flow' },
      ]}
    />
  );
}
