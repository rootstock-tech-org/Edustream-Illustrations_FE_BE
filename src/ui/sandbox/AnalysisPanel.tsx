import React, { useMemo, useState } from 'react';
import { useSandboxStore } from '@/state/useSandboxStore';
import { generateTruthTable } from '@/lib/circuitSimulator';

function KMap({ tt }: { tt: any }) {
  if (!tt || tt.inputLabels.length < 2 || tt.inputLabels.length > 4 || tt.outputLabels.length !== 1) {
    return <div className="text-xs text-ink-muted">K-Map only available for 2-4 inputs and 1 output.</div>;
  }

  const numVars = tt.inputLabels.length;
  
  // A simplistic K-Map renderer for 2 variables as a proof of concept
  if (numVars === 2) {
    const [A, B] = tt.inputLabels;
    const grid = [
      [tt.rows[0]?.outputs[0], tt.rows[1]?.outputs[0]],
      [tt.rows[2]?.outputs[0], tt.rows[3]?.outputs[0]],
    ];
    return (
      <div className="flex flex-col items-center mt-4">
        <h4 className="eyebrow text-xs mb-2">K-Map ({A}\{B})</h4>
        <table className="border-collapse text-xs font-mono text-center">
          <thead>
            <tr>
              <th className="p-1 border border-glass-border"></th>
              <th className="p-1 border border-glass-border bg-surface">0</th>
              <th className="p-1 border border-glass-border bg-surface">1</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="p-1 border border-glass-border bg-surface">0</th>
              <td className={`p-2 border border-glass-border ${grid[0]?.[0] ? 'bg-accent/20 text-accent font-bold' : ''}`}>{grid[0]?.[0]}</td>
              <td className={`p-2 border border-glass-border ${grid[0]?.[1] ? 'bg-accent/20 text-accent font-bold' : ''}`}>{grid[0]?.[1]}</td>
            </tr>
            <tr>
              <th className="p-1 border border-glass-border bg-surface">1</th>
              <td className={`p-2 border border-glass-border ${grid[1]?.[0] ? 'bg-accent/20 text-accent font-bold' : ''}`}>{grid[1]?.[0]}</td>
              <td className={`p-2 border border-glass-border ${grid[1]?.[1] ? 'bg-accent/20 text-accent font-bold' : ''}`}>{grid[1]?.[1]}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return <div className="text-xs text-ink-muted mt-2">K-Map generation for {numVars} variables is complex and omitted in this demo.</div>;
}

export function AnalysisPanel() {
  const nodes = useSandboxStore(state => state.nodes);
  const edges = useSandboxStore(state => state.edges);
  const packageCircuit = useSandboxStore(state => state.packageCircuit);
  const importCircuit = useSandboxStore(state => state.importCircuit);
  
  const [collapsed, setCollapsed] = useState(false);
  const [exportCode, setExportCode] = useState<string | null>(null);

  const tt = useMemo(() => {
    return generateTruthTable(nodes, edges);
  }, [nodes, edges]);

  const handlePackage = () => {
    const name = prompt("Enter a name for this IC (e.g. MyAdder):", "CustomBlock");
    if (name) {
      const code = packageCircuit(name);
      importCircuit(code);
      setExportCode(code);
    }
  };

  if (collapsed) {
    return (
      <aside className="glass absolute right-4 top-4 z-10 flex flex-col rounded-xl p-2 shadow-xl">
        <button onClick={() => setCollapsed(false)} className="eyebrow text-ink hover:text-accent p-2">
          {"<<"} Analysis
        </button>
      </aside>
    );
  }

  return (
    <aside className="glass absolute right-4 top-4 z-10 flex w-72 flex-col gap-4 rounded-xl p-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center border-b border-glass-border pb-2">
        <h2 className="eyebrow text-ink">Analysis & Export</h2>
        <button onClick={() => setCollapsed(true)} className="text-ink-muted hover:text-ink">
          {">>"}
        </button>
      </div>

      <button
        onClick={handlePackage}
        className="lift w-full rounded-md bg-brand py-2 text-sm font-bold text-highlight shadow-md hover:bg-accent transition-colors"
      >
        Package as IC (Black Box)
      </button>

      {exportCode && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-elevated p-2 border border-glass-border">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-accent">IC Packaged!</span>
            <button onClick={() => setExportCode(null)} className="text-ink-muted hover:text-ink text-xs">Close</button>
          </div>
          <p className="text-[10px] text-ink-muted leading-tight">It was added to 'My ICs' on the left. Copy the code below to share it:</p>
          <textarea 
            className="w-full h-20 text-[10px] font-mono bg-surface border border-glass-border rounded p-1 text-ink resize-none"
            readOnly
            value={exportCode}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      )}

      <div className="mt-2">
        <h3 className="eyebrow text-xs mb-2 text-ink-muted">Truth Table</h3>
        {!tt ? (
          <div className="text-xs text-ink-muted italic">Add at least one Input and Output node to see the truth table.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs font-mono text-center">
              <thead>
                <tr className="bg-surface">
                  {tt.inputLabels.map((lbl: string, i: number) => (
                    <th key={`th-in-${i}`} className="p-1 border border-glass-border">{lbl}</th>
                  ))}
                  <th className="p-1 border border-glass-border w-1 bg-glass-border"></th>
                  {tt.outputLabels.map((lbl: string, i: number) => (
                    <th key={`th-out-${i}`} className="p-1 border border-glass-border">{lbl}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tt.rows.map((row: any, rIdx: number) => (
                  <tr key={`tr-${rIdx}`} className="hover:bg-surface-elevated">
                    {row.inputs.map((val: number, i: number) => (
                      <td key={`td-in-${i}`} className="p-1 border border-glass-border">{val}</td>
                    ))}
                    <td className="p-1 border border-glass-border bg-glass-border"></td>
                    {row.outputs.map((val: number, i: number) => (
                      <td key={`td-out-${i}`} className={`p-1 border border-glass-border ${val ? 'text-accent font-bold' : 'text-ink-muted'}`}>
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tt && <KMap tt={tt} />}
    </aside>
  );
}
