import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData } from '@/state/useSandboxStore';

export function OutputNode({ data }: { data: SandboxNodeData }) {
  const on = data.value === 1;

  return (
    <div
      title="Output: Displays the final logic state (0 or 1)."
      style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '6px 8px', borderRadius: 6, position: 'relative',
      border: `2px solid ${on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.4)'}`,
      background: 'rgb(var(--surface-elevated))',
      boxShadow: '0 2px 8px rgba(0,0,0,.1)',
      transition: 'border-color 120ms ease',
    }}>
      {/* Label */}
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'rgb(var(--ink-muted))',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        fontFamily: 'var(--font-sans)',
      }}>
        {data.label || 'Q'}
      </span>

      {/* Digital display */}
      <div style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4,
        border: `1px solid ${on ? 'rgb(var(--accent) / 0.4)' : 'rgb(var(--ink-muted) / 0.15)'}`,
        background: on ? 'rgb(var(--accent) / 0.08)' : 'rgb(var(--ink-muted) / 0.05)',
        fontFamily: 'var(--font-digital), monospace',
        fontSize: 18, lineHeight: 1,
        color: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.3)',
        transition: 'all 100ms ease',
      }}>
        {typeof data.value === 'object' ? 0 : (data.value ?? 0)}
      </div>

      <Handle type="target" position={Position.Left}
        style={{ width: 7, height: 7, left: -5, background: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted))', border: 'none', borderRadius: '50%' }} />
    </div>
  );
}


