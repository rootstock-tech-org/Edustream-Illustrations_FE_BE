import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData, useSandboxStore } from '@/state/useSandboxStore';

export function CustomICNode({ id, data }: { id: string, data: SandboxNodeData }) {
  const deleteNode = useSandboxStore(state => state.deleteNode);
  const icDef = data.icDef;

  if (!icDef) return <div className="glass p-2 text-red-500">Invalid IC</div>;

  return (
    <div
      title={`Custom IC: ${icDef.name || 'Box'}`}
      className="shadow-md relative flex min-w-[120px] flex-col rounded-lg border border-glass-border p-4 bg-surface-elevated text-ink"
    >
      <button 
        onClick={() => deleteNode(id)}
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs text-ink-muted hover:text-ink hover:border-ink transition-colors z-10"
      >
        ×
      </button>

      <div className="mb-4 text-center font-bold text-accent eyebrow">{icDef.name || 'Custom IC'}</div>

      <div className="flex w-full justify-between gap-8 text-xs font-mono text-ink-muted">
        {/* Left Handles (Inputs) */}
        <div className="flex flex-col gap-4">
          {Array.from({ length: icDef.inputCount }).map((_, i) => (
            <div key={`in_${i}`} className="relative flex items-center h-4">
              <span>{`in${i}`}</span>
              <Handle 
                type="target" 
                position={Position.Left} 
                id={`in_${i}`} 
                className="!-left-6 !w-2 !h-2 !bg-surface-elevated !border-ink-muted" 
              />
            </div>
          ))}
        </div>
        
        {/* Right Handles (Outputs) */}
        <div className="flex flex-col gap-4 items-end">
          {Array.from({ length: icDef.outputCount }).map((_, i) => {
            // Determine if this specific output is energized
            // We expect data.value to be an object/record like { out_0: 1, out_1: 0 }
            const isEnergized = typeof data.value === 'object' && data.value !== null 
              ? (data.value as any)[`out_${i}`] === 1 
              : false;

            return (
              <div key={`out_${i}`} className={`relative flex items-center h-4 ${isEnergized ? 'text-accent font-bold' : ''}`}>
                <span>{`out${i}`}</span>
                <Handle 
                  type="source" 
                  position={Position.Right} 
                  id={`out_${i}`} 
                  className={`!-right-6 !w-3 !h-3 !border-2 ${isEnergized ? '!bg-accent !border-highlight' : '!bg-surface-elevated !border-ink-muted'}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
