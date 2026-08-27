import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData } from '@/state/useSandboxStore';

export function AdvancedNode({ data }: { data: SandboxNodeData }) {
  const isEnergized = data.value === 1;

  return (
    <div className={`glass-3 relative flex min-w-[120px] flex-col items-center justify-center rounded-lg border-2 p-4 ${isEnergized ? 'border-accent' : 'border-glass-border'}`}>
      <span className="eyebrow mb-2 text-sm font-bold text-highlight">{data.label || 'Advanced'}</span>
      
      {/* Assuming a D Flip-Flop structure for now */}
      <div className="flex w-full justify-between px-2 text-xs font-mono text-ink-muted">
        <div className="flex flex-col gap-4">
          <div className="relative">
            <span>D</span>
            <Handle type="target" position={Position.Left} id="d" className="!-left-6 !w-2 !h-2 !bg-surface-elevated !border-ink-muted" />
          </div>
          <div className="relative">
            <span>CLK</span>
            <Handle type="target" position={Position.Left} id="clk" className="!-left-6 !w-2 !h-2 !bg-surface-elevated !border-ink-muted" />
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-4">
          <div className="relative text-accent">
            <span>Q</span>
            <Handle type="source" position={Position.Right} id="q" className="!-right-6 !w-3 !h-3 !bg-accent !border-highlight" />
          </div>
          <div className="relative">
            <span className="overline">Q</span>
            <Handle type="source" position={Position.Right} id="qbar" className="!-right-6 !w-2 !h-2 !bg-surface-elevated !border-ink-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
