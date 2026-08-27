import React, { useState } from 'react';
import { useSandboxStore, CustomICDef } from '@/state/useSandboxStore';
import { HoverInfoPanel } from './HoverInfoPanel';

const GATE_TYPES = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'];

export function Sidebar() {
  const customICs = useSandboxStore(state => state.customICs);
  const importCircuit = useSandboxStore(state => state.importCircuit);
  const cleanupLayout = useSandboxStore(state => state.cleanupLayout);
  const [codePopup, setCodePopup] = useState<CustomICDef | null>(null);
  const [hoveredComponent, setHoveredComponent] = useState<string | null>(null);

  const onDragStart = (event: React.DragEvent, nodeType: string, label?: string, gateType?: string, icDef?: any, flipFlopType?: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    if (label) event.dataTransfer.setData('application/reactflow-label', label);
    if (gateType) event.dataTransfer.setData('application/reactflow-gatetype', gateType);
    if (icDef) event.dataTransfer.setData('application/reactflow-icdef', JSON.stringify(icDef));
    if (flipFlopType) event.dataTransfer.setData('application/reactflow-flipfloptype', flipFlopType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleImport = () => {
    const code = prompt("Paste your IC Export Code here:");
    if (code) {
      const success = importCircuit(code);
      if (!success) alert("Invalid IC Code!");
    }
  };

  const getExportCode = (ic: CustomICDef) => {
    const json = JSON.stringify(ic);
    return btoa(encodeURIComponent(json));
  };

  return (
    <>
      <aside className="glass absolute left-4 top-4 z-10 flex w-64 flex-col gap-4 rounded-xl p-4 shadow-xl">
        <div className="flex justify-between items-center border-b border-glass-border pb-2">
          <h2 className="eyebrow text-ink m-0">Components</h2>
          <button 
            onClick={() => cleanupLayout()}
            className="flex items-center gap-1 text-[10px] font-bold text-accent hover:text-highlight transition-colors bg-surface px-2 py-1 rounded border border-accent/30 hover:border-accent"
            title="Auto-arrange nodes"
          >
            ✨ Cleanup
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-ink-muted">I/O & Sources</h3>
          <div className="grid grid-cols-3 gap-2">
            <div
              className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-surface-elevated px-2 py-2 text-xs font-medium text-ink hover:border-accent"
              onDragStart={(e) => onDragStart(e, 'input', 'Input')}
              onMouseEnter={() => setHoveredComponent('Input')}
              onMouseLeave={() => setHoveredComponent(null)}
              draggable
            >
              Input
            </div>
            <div
              className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-surface-elevated px-2 py-2 text-xs font-medium text-ink hover:border-accent"
              onDragStart={(e) => onDragStart(e, 'output', 'Output')}
              onMouseEnter={() => setHoveredComponent('Output')}
              onMouseLeave={() => setHoveredComponent(null)}
              draggable
            >
              Output
            </div>
            <div
              className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-surface-elevated px-2 py-2 text-xs font-medium text-ink hover:border-accent"
              onDragStart={(e) => onDragStart(e, 'clock')}
              onMouseEnter={() => setHoveredComponent('Clock')}
              onMouseLeave={() => setHoveredComponent(null)}
              draggable
            >
              Clock
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-ink-muted">Logic Gates</h3>
          <div className="grid grid-cols-2 gap-2">
            {GATE_TYPES.map((gate) => (
              <div
                key={gate}
                className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:border-accent"
                onDragStart={(e) => onDragStart(e, 'logicGate', gate, gate)}
                onMouseEnter={() => setHoveredComponent(gate)}
                onMouseLeave={() => setHoveredComponent(null)}
                draggable
              >
                {gate}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-ink-muted">Flip-Flops</h3>
          <div className="grid grid-cols-2 gap-2">
            {['D', 'SR', 'JK', 'T'].map((ff) => (
              <div
                key={ff}
                className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-surface-elevated px-3 py-2 text-sm font-medium text-ink hover:border-accent"
                onDragStart={(e) => onDragStart(e, 'flipFlop', undefined, undefined, undefined, ff)}
                onMouseEnter={() => setHoveredComponent(ff)}
                onMouseLeave={() => setHoveredComponent(null)}
                draggable
              >
                {ff} FF
              </div>
            ))}
          </div>
        </div>

      <div className="flex flex-col gap-2 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-ink-muted">My ICs</h3>
          <button 
            onClick={handleImport}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated border border-glass-border text-xs font-bold text-ink hover:text-accent hover:border-accent transition-colors"
            title="Import IC from code"
          >
            +
          </button>
        </div>
        
        {customICs.length === 0 ? (
          <div className="text-[10px] text-ink-muted italic text-center p-2 border border-dashed border-glass-border rounded-md">
            No Custom ICs imported yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {customICs.map(ic => (
              <div
                key={ic.id}
                className="lift flex cursor-grab items-center justify-center rounded-md border border-glass-border bg-brand px-3 py-2 text-sm font-medium text-highlight shadow-sm"
                onDragStart={(e) => onDragStart(e, 'customIC', ic.name, undefined, ic)}
                onContextMenu={(e) => { e.preventDefault(); setCodePopup(ic); }}
                draggable
              >
                {ic.name || 'Custom Box'}
              </div>
            ))}
          </div>
        )}

        {/* Export code popup */}
        {codePopup && (
          <div className="flex flex-col gap-2 rounded-md bg-surface-elevated p-3 border border-glass-border shadow-lg">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-accent">{codePopup.name}</span>
              <button onClick={() => setCodePopup(null)} className="text-ink-muted hover:text-ink text-xs">✕</button>
            </div>
            <p className="text-[10px] text-ink-muted">Right-click copied! Share this code:</p>
            <textarea 
              className="w-full h-16 text-[9px] font-mono bg-surface border border-glass-border rounded p-1.5 text-ink resize-none"
              readOnly
              value={getExportCode(codePopup)}
              onClick={(e) => {
                (e.target as HTMLTextAreaElement).select();
                navigator.clipboard.writeText(getExportCode(codePopup));
              }}
            />
            <button
              className="text-xs font-medium text-highlight bg-accent rounded py-1 hover:opacity-90 transition-opacity"
              onClick={() => {
                navigator.clipboard.writeText(getExportCode(codePopup));
                setCodePopup(null);
              }}
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </aside>
    {hoveredComponent && <HoverInfoPanel componentId={hoveredComponent} />}
    </>
  );
}
