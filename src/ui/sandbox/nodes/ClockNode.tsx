import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData } from '@/state/useSandboxStore';

export function ClockNode({ data }: { data: SandboxNodeData }) {
  const on = data.value === 1;

  return (
    <div
      title="Clock: Automatically toggles between 0 and 1 every second (1Hz)"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '6px 8px', borderRadius: 6, position: 'relative',
        border: `2px solid ${on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.4)'}`,
        background: 'rgb(var(--surface-elevated))',
        boxShadow: '0 2px 8px rgba(0,0,0,.1)',
        transition: 'border-color 120ms ease',
      }}
    >
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'rgb(var(--ink-muted))',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        fontFamily: 'var(--font-sans)',
      }}>
        CLK (1Hz)
      </span>

      <div style={{
        width: 32, height: 18, borderRadius: 4,
        background: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', transition: 'all 120ms ease',
      }}>
        {/* Simple square wave icon */}
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke={on ? '#fff' : 'rgba(255,255,255,0.7)'} strokeWidth="1.5">
          <path d="M2,8 L6,8 L6,2 L14,2 L14,8 L18,8" />
        </svg>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ width: 7, height: 7, right: -5, background: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted))', border: 'none', borderRadius: '50%' }} />
    </div>
  );
}
