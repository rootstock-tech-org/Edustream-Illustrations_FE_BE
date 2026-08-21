import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { simulateCircuit } from '@/lib/circuitSimulator';

export type SandboxNodeType = 'input' | 'output' | 'logicGate' | 'advanced' | 'customIC' | 'clock' | 'flipFlop';

export type CustomICDef = {
  id: string;
  name: string;
  nodes: SandboxNode[];
  edges: Edge[];
  inputCount: number;
  outputCount: number;
};

export type SandboxNodeData = {
  label?: string;
  gateType?: 'AND' | 'OR' | 'NOT' | 'XOR' | 'NAND' | 'NOR';
  flipFlopType?: 'D' | 'SR' | 'JK' | 'T';
  value?: number | Record<string, number>;
  icData?: CustomICDef;
  inputs?: Record<string, number>;
  clock?: boolean;
  icDef?: CustomICDef;
  inputCount?: number;
};

export type SandboxNode = Node<SandboxNodeData, SandboxNodeType>;

interface SandboxState {
  nodes: SandboxNode[];
  edges: Edge[];
  customICs: CustomICDef[];
  onNodesChange: OnNodesChange<SandboxNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: SandboxNode) => void;
  updateNodeData: (nodeId: string, data: Partial<SandboxNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  evaluateLogic: () => void;
  packageCircuit: (name: string) => string;
  importCircuit: (code: string) => boolean;
  cleanupLayout: () => void;
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  nodes: [],
  edges: [],
  customICs: [],
  onNodesChange: (changes: NodeChange<SandboxNode>[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
    get().evaluateLogic();
  },
  onConnect: (connection: Connection) => {
    set({
      edges: addEdge({ ...connection, type: 'smartWire', animated: false }, get().edges),
    });
    get().evaluateLogic();
  },
  addNode: (node: SandboxNode) => {
    set({ nodes: [...get().nodes, node] });
  },
  updateNodeData: (nodeId: string, data: Partial<SandboxNodeData>) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
    });
    get().evaluateLogic();
  },
  deleteNode: (nodeId: string) => {
    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    });
    get().evaluateLogic();
  },
  deleteEdge: (edgeId: string) => {
    set({
      edges: get().edges.filter((edge) => edge.id !== edgeId),
    });
    get().evaluateLogic();
  },
  evaluateLogic: () => {
    const { nodes, edges } = get();
    
    // Build initial values map
    const initialValues = new Map<string, any>();
    nodes.forEach(n => initialValues.set(n.id, n.data.value ?? 0));

    // Simulate circuit
    const { newValues, unsettled } = simulateCircuit(nodes, edges, initialValues);

    // Only update if there's a difference to avoid React Flow re-renders
    let hasChanges = false;
    nodes.forEach(n => {
      // Need JSON.stringify check for objects (customIC outputs)
      const currentVal = n.data.value;
      const newVal = newValues.get(n.id);
      if (typeof currentVal === 'object' || typeof newVal === 'object') {
        if (JSON.stringify(currentVal) !== JSON.stringify(newVal)) hasChanges = true;
      } else if (currentVal !== newVal) {
        hasChanges = true;
      }
    });

    let hasEdgeChanges = false;
    const updatedEdges = edges.map(edge => {
      const sourceVal = newValues.get(edge.source);
      let val = 0;
      if (typeof sourceVal === 'object' && sourceVal !== null) {
        val = sourceVal[edge.sourceHandle || 'out_0'] ?? 0;
      } else {
        val = sourceVal ?? 0;
      }
      
      const isEnergized = val === 1;
      const stroke = isEnergized ? 'rgb(var(--accent))' : 'rgb(var(--ink-muted))';
      const strokeWidth = isEnergized ? 3 : 2;
      
      if (edge.style?.stroke !== stroke || edge.style?.strokeWidth !== strokeWidth) {
        hasEdgeChanges = true;
        return { ...edge, style: { ...edge.style, stroke, strokeWidth } };
      }
      return edge;
    });

    if (hasChanges || hasEdgeChanges) {
      set({
        nodes: !hasChanges ? nodes : nodes.map((n) => {
          const updatedValue = newValues.get(n.id);
          // Compare again
          const currentVal = n.data.value;
          let changed = false;
          if (typeof currentVal === 'object' || typeof updatedValue === 'object') {
            changed = JSON.stringify(currentVal) !== JSON.stringify(updatedValue);
          } else {
            changed = currentVal !== updatedValue;
          }

          if (changed) {
            return { ...n, data: { ...n.data, value: updatedValue } };
          }
          return n;
        }),
        edges: hasEdgeChanges ? updatedEdges : edges
      });
    }

    // If the circuit hasn't settled (e.g. an oscillator loop like an SR Latch), 
    // keep evaluating it on a short interval so the user can visually see the oscillation!
    if (unsettled) {
      setTimeout(() => {
        get().evaluateLogic();
      }, 100);
    }
  },
  packageCircuit: (name: string) => {
    const { nodes, edges } = get();
    const inputCount = nodes.filter(n => n.type === 'input').length;
    const outputCount = nodes.filter(n => n.type === 'output').length;
    const icDef: CustomICDef = { id: `ic_${Date.now()}`, name, nodes, edges, inputCount, outputCount };
    const json = JSON.stringify(icDef);
    return btoa(encodeURIComponent(json));
  },
  importCircuit: (code: string) => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(code);
      } catch {
        const decoded = decodeURIComponent(atob(code));
        parsed = JSON.parse(decoded);
      }
      
      if (parsed.name && parsed.nodes && parsed.edges) {
        const icDef: CustomICDef = {
          id: parsed.id || `ic_${Date.now()}`,
          name: parsed.name,
          nodes: parsed.nodes,
          edges: parsed.edges,
          inputCount: parsed.inputCount ?? parsed.nodes.filter((n: any) => n.type === 'input').length,
          outputCount: parsed.outputCount ?? parsed.nodes.filter((n: any) => n.type === 'output').length,
        };
        set({ customICs: [...get().customICs, icDef] });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
  cleanupLayout: async () => {
    // Dynamic import to avoid dagre SSR issues if any
    const { getLayoutedElements } = await import('@/lib/layoutUtils');
    const { nodes } = getLayoutedElements(get().nodes, get().edges);
    set({ nodes: [...nodes] });
  },
}));
