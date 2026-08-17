'use client';

import React, { useRef, useCallback, useState, useEffect, MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow,
  ConnectionMode,
  Node,
  Edge,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';


import { useSandboxStore, SandboxNode, SandboxNodeType } from '@/state/useSandboxStore';
import { Sidebar } from './Sidebar';
import { InputNode } from './nodes/InputNode';
import { OutputNode } from './nodes/OutputNode';
import { GateNode } from './nodes/GateNode';
import { AdvancedNode } from './nodes/AdvancedNode';
import { CustomICNode } from './nodes/CustomICNode';
import { AnalysisPanel } from './AnalysisPanel';

import { ClockNode } from './nodes/ClockNode';
import { FlipFlopNode } from './nodes/FlipFlopNode';
import { SmartWire } from './edges/SmartWire';

const nodeTypes = {
  input: InputNode,
  output: OutputNode,
  logicGate: GateNode,
  advanced: AdvancedNode,
  customIC: CustomICNode,
  clock: ClockNode,
  flipFlop: FlipFlopNode,
};

const edgeTypes = {
  smartWire: SmartWire,
};

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // Global Clock Tick
  useEffect(() => {
    const interval = setInterval(() => {
      const state = useSandboxStore.getState();
      const clockNodes = state.nodes.filter(n => n.type === 'clock');
      if (clockNodes.length > 0) {
        useSandboxStore.setState({
          nodes: state.nodes.map(n => {
            if (n.type === 'clock') {
              return { ...n, data: { ...n.data, value: n.data.value === 1 ? 0 : 1 } };
            }
            return n;
          })
        });
        useSandboxStore.getState().evaluateLogic();
      }
    }, 1000); // 1Hz clock
    return () => clearInterval(interval);
  }, []);

  const nodes = useSandboxStore((state) => state.nodes);
  const edges = useSandboxStore((state) => state.edges);
  const onNodesChange = useSandboxStore((state) => state.onNodesChange);
  const onEdgesChange = useSandboxStore((state) => state.onEdgesChange);
  const onConnect = useSandboxStore((state) => state.onConnect);
  const addNode = useSandboxStore((state) => state.addNode);
  const deleteNode = useSandboxStore((state) => state.deleteNode);
  const deleteEdge = useSandboxStore((state) => state.deleteEdge);

  const [menu, setMenu] = useState<{ id: string; type: 'node' | 'edge'; top: number; left: number } | null>(null);

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      event.preventDefault();
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (pane) {
        setMenu({
          id: node.id,
          type: 'node',
          top: event.clientY - pane.top,
          left: event.clientX - pane.left,
        });
      }
    },
    []
  );

  const onEdgeContextMenu = useCallback(
    (event: MouseEvent, edge: Edge) => {
      event.preventDefault();
      const pane = reactFlowWrapper.current?.getBoundingClientRect();
      if (pane) {
        setMenu({
          id: edge.id,
          type: 'edge',
          top: event.clientY - pane.top,
          left: event.clientX - pane.left,
        });
      }
    },
    []
  );

  const onPaneClick = useCallback(() => setMenu(null), []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);



  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type') as SandboxNodeType;
      const label = event.dataTransfer.getData('application/reactflow-label');
      const gateType = event.dataTransfer.getData('application/reactflow-gatetype');
      const flipFlopType = event.dataTransfer.getData('application/reactflow-flipfloptype');
      const icDefStr = event.dataTransfer.getData('application/reactflow-icdef');

      if (!type) {
        return;
      }

      // Project drop position to flow canvas coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Auto-assign alphabet for input nodes
      let nodeLabel = label || type;
      if (type === 'input') {
        const currentInputs = useSandboxStore.getState().nodes.filter(n => n.type === 'input');
        const usedLetters = new Set(currentInputs.map(n => (n.data.label || '').toUpperCase()));
        const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        nodeLabel = alpha.split('').find(c => !usedLetters.has(c)) || `IN${currentInputs.length}`;
      }
      if (type === 'output') {
        const currentOutputs = useSandboxStore.getState().nodes.filter(n => n.type === 'output');
        nodeLabel = `Q${currentOutputs.length > 0 ? currentOutputs.length : ''}`;
      }

      const newNode: SandboxNode = {
        id: uuidv4(),
        type,
        position,
        data: {
          label: nodeLabel,
          gateType: gateType as any,
          flipFlopType: flipFlopType as any,
          value: type === 'flipFlop' ? { Q: 0, Q_bar: 1, prevClk: 0 } : 0,
          icDef: icDefStr ? JSON.parse(icDefStr) : undefined,
        },
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="h-full w-full bg-surface" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'smartWire', animated: false, style: { strokeWidth: 2, stroke: 'rgb(var(--ink-muted))' } }}
        connectionMode={ConnectionMode.Loose}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        panOnScroll={true}
        zoomOnScroll={false}
        zoomOnPinch={true}
        selectionMode={SelectionMode.Partial}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="currentColor" className="text-ink-muted/40" />
        <Controls className="!bg-surface-elevated !border-glass-border !shadow-xl [&>button]:!border-b-glass-border [&>button]:!text-ink" />
        
        {menu && (
          <div
            style={{ top: menu.top, left: menu.left }}
            className="absolute z-50 glass flex flex-col rounded-md border border-glass-border bg-surface-elevated p-1 shadow-xl min-w-[120px]"
          >
            {menu.type === 'node' && (
              (() => {
                const node = nodes.find(n => n.id === menu.id);
                if (node?.type === 'logicGate' && node.data.gateType !== 'NOT') {
                  return (
                    <>
                      <button
                        className="text-left rounded px-3 py-2 text-sm font-medium text-ink hover:bg-surface transition-colors"
                        onClick={() => {
                          const currentCount = node.data.inputCount || 2;
                          useSandboxStore.getState().updateNodeData(menu.id, { inputCount: currentCount + 1 });
                          setMenu(null);
                        }}
                      >
                        Add Input
                      </button>
                      <button
                        className="text-left rounded px-3 py-2 text-sm font-medium text-ink hover:bg-surface transition-colors"
                        onClick={() => {
                          const currentCount = node.data.inputCount || 2;
                          if (currentCount > 2) {
                            const newCount = currentCount - 1;
                            const state = useSandboxStore.getState();
                            state.updateNodeData(menu.id, { inputCount: newCount });
                            
                            // Delete any dangling edge connected to the removed input handle
                            const handleId = `in_${newCount}`;
                            const edgesToDelete = state.edges.filter(e => e.target === menu.id && e.targetHandle === handleId);
                            edgesToDelete.forEach(e => state.deleteEdge(e.id));
                          }
                          setMenu(null);
                        }}
                      >
                        Remove Input
                      </button>
                      <div className="h-px bg-glass-border my-1 mx-2" />
                    </>
                  );
                }
                return null;
              })()
            )}
            <button
              className="text-left rounded px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors"
              onClick={() => {
                if (menu.type === 'node') deleteNode(menu.id);
                if (menu.type === 'edge') deleteEdge(menu.id);
                setMenu(null);
              }}
            >
              {menu.type === 'node' ? 'Delete Node' : 'Delete Wire'}
            </button>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

export function SandboxEditor() {
  return (
    <ReactFlowProvider>
      <div className="relative h-screen w-full">
        <Sidebar />
        <FlowCanvas />
        <AnalysisPanel />
      </div>
    </ReactFlowProvider>
  );
}
