import { Handle, Position } from '@xyflow/react';
import { SandboxNodeData, useSandboxStore } from '@/state/useSandboxStore';
import { useState } from 'react';

export function InputNode({ id, data }: { id: string; data: SandboxNodeData }) {
  const update = useSandboxStore((s) => s.updateNodeData);
  const on = data.value === 1;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label || 'A');

  const commit = () => {
    setEditing(false);
    update(id, { label: draft || 'A' });
  };

  return (
    <div
      title="Input: Click to toggle state (0/1). Double-click label to rename."
      style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '6px 8px', borderRadius: 6, position: 'relative',
      border: `2px solid ${on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.4)'}`,
      background: 'rgb(var(--surface-elevated))',
      boxShadow: '0 2px 8px rgba(0,0,0,.1)',
      transition: 'border-color 120ms ease',
    }}>
      {/* Editable label */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          style={{
            width: 32, fontSize: 10, fontWeight: 700, textAlign: 'center',
            background: 'transparent', border: 'none', borderBottom: '1px solid rgb(var(--accent))',
            color: 'rgb(var(--ink))', outline: 'none', fontFamily: 'var(--font-sans)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}
        />
      ) : (
        <span
          onDoubleClick={() => { setDraft(data.label || 'A'); setEditing(true); }}
          style={{
            fontSize: 10, fontWeight: 700, color: 'rgb(var(--ink-muted))',
            textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'text',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {data.label || 'A'}
        </span>
      )}

      {/* Toggle switch */}
      <div
        onClick={() => update(id, { value: on ? 0 : 1 })}
        style={{
          width: 32, height: 18, borderRadius: 9, cursor: 'pointer',
          background: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted) / 0.3)',
          position: 'relative', transition: 'all 120ms ease',
        }}
      >
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
          position: 'absolute', top: 3,
          left: on ? 17 : 3, transition: 'left 120ms ease',
        }} />
      </div>

      <Handle type="source" position={Position.Right}
        style={{ width: 7, height: 7, right: -5, background: on ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted))', border: 'none', borderRadius: '50%' }} />
    </div>
  );
}

