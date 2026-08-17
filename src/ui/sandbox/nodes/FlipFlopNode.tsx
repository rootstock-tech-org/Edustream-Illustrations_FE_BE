import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData, useSandboxStore } from '@/state/useSandboxStore';

const FLIP_FLOP_INFO: Record<string, string> = {
  D: 'D Flip-Flop: Captures the value of the D input on the rising edge of the clock.',
  SR: 'SR Flip-Flop: Sets (Q=1) on S=1, Resets (Q=0) on R=1. Both 1 is undefined.',
  JK: 'JK Flip-Flop: Like SR, but J=1,K=1 toggles the state.',
  T: 'T Flip-Flop: Toggles state on rising clock edge if T=1. Holds state if T=0.',
};

export function FlipFlopNode({ id, data }: { id: string; data: SandboxNodeData }) {
  const deleteNode = useSandboxStore(state => state.deleteNode);
  const type = data.flipFlopType || 'D';
  const info = FLIP_FLOP_INFO[type];

  // Q is energized if data.value (which stores state) has Q=1
  // We expect data.value to be an object: { Q: 1, Q_bar: 0, prevClk: 0 }
  const state = typeof data.value === 'object' && data.value !== null ? data.value as any : { Q: 0, Q_bar: 1 };
  const qOn = state.Q === 1;
  const qBarOn = state.Q_bar === 1;

  // Determine input handles based on type
  const inputs = type === 'D' ? ['D'] : type === 'T' ? ['T'] : type === 'SR' ? ['S', 'R'] : ['J', 'K'];

  return (
    <div
      title={info}
      className="shadow-md relative flex min-w-[100px] flex-col rounded-lg border border-glass-border p-3 bg-surface-elevated text-ink"
    >
      <button 
        onClick={() => deleteNode(id)}
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs text-ink-muted hover:text-ink hover:border-ink transition-colors z-10"
      >
        ×
      </button>

      <div className="mb-3 text-center font-bold text-accent eyebrow">{type} Flip-Flop</div>

      <div className="flex w-full justify-between gap-8 text-xs font-mono font-bold text-ink-muted">
        {/* Inputs */}
        <div className="flex flex-col gap-3 justify-center">
          {inputs.map((inLabel, i) => (
            <div key={inLabel} className="relative flex items-center h-4">
              <span>{inLabel}</span>
              <Handle 
                type="target" 
                position={Position.Left} 
                id={inLabel} 
                className="!-left-5 !w-2 !h-2 !bg-surface-elevated !border-ink-muted" 
              />
            </div>
          ))}
          <div className="relative flex items-center h-4 text-accent">
            <span>CLK</span>
            <Handle 
              type="target" 
              position={Position.Left} 
              id="CLK" 
              className="!-left-5 !w-2 !h-2 !bg-surface-elevated !border-accent" 
            />
          </div>
        </div>

        {/* Outputs */}
        <div className="flex flex-col gap-3 justify-center items-end">
          <div className={`relative flex items-center h-4 ${qOn ? 'text-accent' : ''}`}>
            <span>Q</span>
            <Handle 
              type="source" 
              position={Position.Right} 
              id="Q" 
              className={`!-right-5 !w-3 !h-3 !border-2 ${qOn ? '!bg-accent !border-highlight' : '!bg-surface-elevated !border-ink-muted'}`}
            />
          </div>
          <div className={`relative flex items-center h-4 ${qBarOn ? 'text-accent' : ''}`}>
            <span>Q'</span>
            <Handle 
              type="source" 
              position={Position.Right} 
              id="Q_bar" 
              className={`!-right-5 !w-3 !h-3 !border-2 ${qBarOn ? '!bg-accent !border-highlight' : '!bg-surface-elevated !border-ink-muted'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
