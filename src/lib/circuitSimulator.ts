import { Edge } from '@xyflow/react';
import { SandboxNode } from '@/state/useSandboxStore';

export function simulateCircuit(
  nodes: SandboxNode[],
  edges: Edge[],
  initialValues: Map<string, any> = new Map()
): { newValues: Map<string, any>, unsettled: boolean } {
  const nodeValues = new Map<string, any>(initialValues);
  
  // Copy to avoid mutating original values if we re-evaluate
  nodes.forEach((n) => {
    if (!nodeValues.has(n.id)) {
      nodeValues.set(n.id, n.data.value ?? 0);
    }
  });

  const maxPasses = 15;
  let unsettled = false;

  // Simple multi-pass evaluation for combinational logic
  for (let pass = 0; pass < maxPasses; pass++) {
    let passChanged = false;

    nodes.forEach((node) => {
      if (node.type === 'input') return;

      const incomingEdges = edges.filter((e) => e.target === node.id);

      if (node.type === 'logicGate' && node.data.gateType) {
        const type = node.data.gateType;

        if (type === 'NOT') {
          const edge = incomingEdges[0];
          let val = 0;
          if (edge) {
            const sourceVal = nodeValues.get(edge.source ?? '');
            val = typeof sourceVal === 'object' ? (sourceVal[edge.sourceHandle || 'out_0'] ?? 0) : (sourceVal ?? 0);
          }
          const newValue = val === 0 ? 1 : 0;
          if (nodeValues.get(node.id) !== newValue) {
            nodeValues.set(node.id, newValue);
            passChanged = true;
          }
        } else {
          const inputVals: number[] = [];
          const inputCount = node.data.inputCount || 2;
          
          for (let i = 0; i < inputCount; i++) {
            const handle = `in_${i}`;
            const fallbackHandle = i === 0 ? 'a' : (i === 1 ? 'b' : null);
            const edge = incomingEdges.find(e => e.targetHandle === handle || (fallbackHandle && e.targetHandle === fallbackHandle));
            
            if (edge) {
              const sourceVal = nodeValues.get(edge.source ?? '');
              const val = typeof sourceVal === 'object' ? (sourceVal[edge.sourceHandle || 'out_0'] ?? 0) : (sourceVal ?? 0);
              inputVals.push(val);
            } else {
              inputVals.push(0); // Unconnected pins default to 0
            }
          }

          let newValue = 0;
          if (inputVals.length === 0) {
            newValue = 0;
          } else {
            switch (type) {
              case 'AND': newValue = inputVals.every(v => v === 1) ? 1 : 0; break;
              case 'OR': newValue = inputVals.some(v => v === 1) ? 1 : 0; break;
              case 'NAND': newValue = inputVals.every(v => v === 1) ? 0 : 1; break;
              case 'NOR': newValue = inputVals.some(v => v === 1) ? 0 : 1; break;
              case 'XOR': {
                const ones = inputVals.filter(v => v === 1).length;
                newValue = ones % 2 === 1 ? 1 : 0;
                break;
              }
            }
          }

          if (nodeValues.get(node.id) !== newValue) {
            nodeValues.set(node.id, newValue);
            passChanged = true;
          }
        }


      } else if (node.type === 'output') {
        let newValue = 0;
        if (incomingEdges.length >= 1) {
          const edge = incomingEdges[0];
          const sourceVal = nodeValues.get(edge?.source ?? '');
          newValue = typeof sourceVal === 'object' ? (sourceVal[edge?.sourceHandle || 'out_0'] ?? 0) : (sourceVal ?? 0);
        }
        if (nodeValues.get(node.id) !== newValue) {
          nodeValues.set(node.id, newValue);
          passChanged = true;
        }
      } else if (node.type === 'flipFlop' && node.data.flipFlopType) {
        const state = nodeValues.get(node.id) || { Q: 0, Q_bar: 1, prevClk: 0 };
        const type = node.data.flipFlopType;
        
        let CLK = 0, D = 0, S = 0, R = 0, J = 0, K = 0, T = 0;
        
        // Read inputs
        incomingEdges.forEach(edge => {
          const sourceVal = nodeValues.get(edge.source ?? '');
          const val = typeof sourceVal === 'object' ? (sourceVal[edge.sourceHandle || 'out_0'] ?? 0) : (sourceVal ?? 0);
          
          if (edge.targetHandle === 'CLK') CLK = val;
          else if (edge.targetHandle === 'D') D = val;
          else if (edge.targetHandle === 'S') S = val;
          else if (edge.targetHandle === 'R') R = val;
          else if (edge.targetHandle === 'J') J = val;
          else if (edge.targetHandle === 'K') K = val;
          else if (edge.targetHandle === 'T') T = val;
        });

        let newQ = state.Q;

        // Rising edge detection
        if (state.prevClk === 0 && CLK === 1) {
          if (type === 'D') {
            newQ = D;
          } else if (type === 'T') {
            if (T === 1) newQ = state.Q === 0 ? 1 : 0;
          } else if (type === 'SR') {
            if (S === 1 && R === 0) newQ = 1;
            else if (S === 0 && R === 1) newQ = 0;
            // S=1, R=1 is usually invalid, keep current state
          } else if (type === 'JK') {
            if (J === 1 && K === 0) newQ = 1;
            else if (J === 0 && K === 1) newQ = 0;
            else if (J === 1 && K === 1) newQ = state.Q === 0 ? 1 : 0;
          }
        }

        const newQ_bar = newQ === 1 ? 0 : 1;
        const newState = { Q: newQ, Q_bar: newQ_bar, prevClk: CLK };
        
        if (JSON.stringify(state) !== JSON.stringify(newState)) {
          nodeValues.set(node.id, newState);
          passChanged = true;
        }
      } else if (node.type === 'customIC' && node.data.icDef) {
          const icDef = node.data.icDef;
          const innerInputs = icDef.nodes.filter(n => n.type === 'input').sort((a, b) => a.position.y - b.position.y);
          const innerOutputs = icDef.nodes.filter(n => n.type === 'output').sort((a, b) => a.position.y - b.position.y);

          const innerInitialValues = new Map<string, any>();
          innerInputs.forEach((innerInput, index) => {
            const edgeForInput = incomingEdges.find(e => e.targetHandle === `in_${index}`);
            // If the source is another custom IC, we need to extract the specific output handle value
            let val = 0;
            if (edgeForInput) {
              const sourceVal = nodeValues.get(edgeForInput.source);
              if (typeof sourceVal === 'object' && sourceVal !== null) {
                val = sourceVal[edgeForInput.sourceHandle || 'out_0'] ?? 0;
              } else {
                val = sourceVal ?? 0;
              }
            }
            innerInitialValues.set(innerInput.id, val);
          });

          const { newValues: innerValues } = simulateCircuit(icDef.nodes, icDef.edges, innerInitialValues);

          const newOutputRecord: Record<string, number> = {};
          innerOutputs.forEach((innerOut, index) => {
            newOutputRecord[`out_${index}`] = innerValues.get(innerOut.id) ?? 0;
          });

          const currentRecord = nodeValues.get(node.id);
          if (JSON.stringify(currentRecord) !== JSON.stringify(newOutputRecord)) {
            nodeValues.set(node.id, newOutputRecord);
            passChanged = true;
          }
      }
    });

    if (!passChanged) break; // Reached stable state
    if (pass === maxPasses - 1) unsettled = true;
  }

  return { newValues: nodeValues, unsettled };
}

export function generateTruthTable(nodes: SandboxNode[], edges: Edge[]) {
  const inputs = nodes.filter(n => n.type === 'input').sort((a, b) => a.position.y - b.position.y);
  const outputs = nodes.filter(n => n.type === 'output').sort((a, b) => a.position.y - b.position.y);

  if (inputs.length === 0 || outputs.length === 0) return null;
  // Limit to 8 inputs (256 rows) to prevent locking up the browser
  if (inputs.length > 8) return null;

  const rows = [];
  const numRows = Math.pow(2, inputs.length);

  for (let i = 0; i < numRows; i++) {
    const initialValues = new Map<string, any>();
    
    // Set input values based on binary representation of i
    inputs.forEach((inputNode, index) => {
      // most significant bit first or last? Let's do standard: A (index 0) is most significant
      const bit = (i >> (inputs.length - 1 - index)) & 1;
      initialValues.set(inputNode.id, bit);
    });

    const { newValues: evaluated } = simulateCircuit(nodes, edges, initialValues);
    
    const rowOutputs = outputs.map(outNode => evaluated.get(outNode.id) ?? 0);
    const rowInputs = inputs.map(inNode => initialValues.get(inNode.id) ?? 0);

    rows.push({ inputs: rowInputs, outputs: rowOutputs });
  }

  return {
    inputLabels: inputs.map(n => n.data.label || 'In'),
    outputLabels: outputs.map(n => n.data.label || 'Out'),
    rows
  };
}
