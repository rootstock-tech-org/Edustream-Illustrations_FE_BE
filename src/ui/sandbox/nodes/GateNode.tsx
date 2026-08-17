import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { SandboxNodeData, useSandboxStore } from '@/state/useSandboxStore';
import { useEffect } from 'react';

const GateIcon = ({ type, isEnergized, inputCount }: { type: string, isEnergized: boolean, inputCount: number }) => {
  const strokeColor = isEnergized ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted))';
  const strokeWidth = "2.5";
  const fill = "rgb(var(--surface))";
  
  // Calculate dynamic height to prevent crowding
  const spacing = 10; // Vertical space between inputs
  const minHeight = 40;
  const H = inputCount <= 3 ? minHeight : Math.max(minHeight, (inputCount - 1) * spacing + 20);
  const midY = H / 2;

  // Distribute input lines evenly between (midY - offset) and (midY + offset)
  const yPositions = Array.from({ length: inputCount }, (_, i) => {
    if (inputCount === 1) return midY;
    const totalSpan = (inputCount - 1) * spacing;
    const startY = midY - (totalSpan / 2);
    return startY + spacing * i;
  });

  const renderInputs = (x2: number) => (
    <>
      {yPositions.map((y, i) => (
        <line key={i} x1="0" y1={y} x2={x2} y2={y} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
      ))}
    </>
  );

  switch (type) {
    case 'AND':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(16)}
          <line x1="44" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 16 6 L 16 ${H-6} L 30 ${H-6} A 14 ${midY-6} 0 0 0 30 6 Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'OR':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(22)}
          <line x1="50" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 16 6 Q 26 ${midY} 16 ${H-6} Q 38 ${H-6} 50 ${midY} Q 38 6 16 6 Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'NOT':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(20)}
          <line x1="53" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 20 6 L 20 ${H-6} L 44 ${midY} Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
          <circle cx="49" cy={midY} r="4" fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'XOR':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(22)}
          <line x1="54" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 12 6 Q 22 ${midY} 12 ${H-6}`} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <path d={`M 20 6 Q 30 ${midY} 20 ${H-6} Q 42 ${H-6} 54 ${midY} Q 42 6 20 6 Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'NAND':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(16)}
          <line x1="53" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 16 6 L 16 ${H-6} L 30 ${H-6} A 14 ${midY-6} 0 0 0 30 6 Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
          <circle cx="49" cy={midY} r="4" fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    case 'NOR':
      return (
        <svg width="112" height={H * 1.6} viewBox={`0 0 70 ${H}`} className="text-ink overflow-visible">
          {renderInputs(22)}
          <line x1="57" y1={midY} x2="70" y2={midY} stroke="rgb(var(--ink-muted))" strokeWidth={strokeWidth} />
          <path d={`M 16 6 Q 26 ${midY} 16 ${H-6} Q 38 ${H-6} 50 ${midY} Q 38 6 16 6 Z`} fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
          <circle cx="53" cy={midY} r="4" fill={fill} stroke={strokeColor} strokeWidth={strokeWidth} />
        </svg>
      );
    default:
      return <span className="font-bold text-xs">{type}</span>;
  }
};

export function GateNode({ id, data }: { id: string; data: SandboxNodeData }) {
  const deleteNode = useSandboxStore(state => state.deleteNode);
  const updateNodeInternals = useUpdateNodeInternals();
  const type = data.gateType || 'AND';
  const isEnergized = data.value === 1;
  const inputCount = type === 'NOT' ? 1 : (data.inputCount || 2);

  useEffect(() => {
    updateNodeInternals(id);
  }, [inputCount, id, updateNodeInternals]);

  const GATE_INFO: Record<string, string> = {
    AND: 'AND Gate: Outputs 1 only if all inputs are 1.',
    OR: 'OR Gate: Outputs 1 if at least one input is 1.',
    NOT: 'NOT Gate: Inverts the input (1 becomes 0, 0 becomes 1).',
    NAND: 'NAND Gate: Outputs 0 only if all inputs are 1.',
    NOR: 'NOR Gate: Outputs 0 if at least one input is 1.',
    XOR: 'XOR Gate: Outputs 1 if inputs are different.',
  };

  const inputs = Array.from({ length: inputCount }, (_, i) => `in_${i}`);
  
  const spacing = 10;
  const minHeight = 40;
  const H = inputCount <= 3 ? minHeight : Math.max(minHeight, (inputCount - 1) * spacing + 20);
  const midY = H / 2;

  return (
    <div
      title={GATE_INFO[type]}
      className="relative flex items-center justify-center text-ink group"
      style={{ height: H * 1.6 }}
    >
      <button 
        onClick={() => deleteNode(id)}
        className="absolute -top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs text-ink-muted hover:text-ink hover:border-ink transition-colors z-20 opacity-0 group-hover:opacity-100"
      >
        ×
      </button>

      {type !== 'NOT' && (
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => {
              if (inputCount > 2) {
                const newCount = inputCount - 1;
                const state = useSandboxStore.getState();
                state.updateNodeData(id, { inputCount: newCount });
                const handleId = `in_${newCount}`;
                const edgesToDelete = state.edges.filter(e => e.target === id && e.targetHandle === handleId);
                edgesToDelete.forEach(e => state.deleteEdge(e.id));
              }
            }}
            disabled={inputCount <= 2}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs font-bold text-ink-muted hover:text-ink hover:border-ink transition-colors disabled:opacity-50"
            title="Remove Input"
          >
            -
          </button>
          <button 
            onClick={() => useSandboxStore.getState().updateNodeData(id, { inputCount: inputCount + 1 })}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs font-bold text-ink-muted hover:text-ink hover:border-ink transition-colors"
            title="Add Input"
          >
            +
          </button>
        </div>
      )}

      {inputs.map((inLabel, i) => {
        const totalSpan = (inputCount - 1) * spacing;
        const startY = midY - (totalSpan / 2);
        const y = startY + spacing * i;
        return (
          <Handle 
            key={inLabel}
            type="target" 
            position={Position.Left} 
            id={inLabel} 
            style={{ top: `${(y / H) * 100}%`, left: '0px', transform: 'translate(-50%, -50%)' }}
            className="!absolute !w-2 !h-2 !bg-surface-elevated !border-ink-muted" 
          />
        );
      })}
      
      <GateIcon type={type} isEnergized={isEnergized} inputCount={inputCount} />

      <Handle
        type="source"
        position={Position.Right}
        style={{ top: '50%', right: '0px', transform: 'translate(50%, -50%)' }}
        className={`!absolute !w-2 !h-2 !border-2 z-10 ${isEnergized ? '!bg-accent !border-highlight' : '!bg-surface-elevated !border-ink-muted'}`}
      />
    </div>
  );
}
