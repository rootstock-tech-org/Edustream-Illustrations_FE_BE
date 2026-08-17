import dagre from 'dagre';
import { SandboxNode } from '@/state/useSandboxStore';
import { Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Standard dimensions for our nodes based on UI styling
const NODE_WIDTH = 120;
const NODE_HEIGHT = 80;

export const getLayoutedElements = (
  nodes: SandboxNode[],
  edges: Edge[],
  direction = 'LR' // Left to Right flow is standard for circuits
) => {
  const isHorizontal = direction === 'LR';
  
  // Set graph settings with good padding for routing wires
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80, // Vertical spacing between nodes in the same column
    ranksep: 120, // Horizontal spacing between columns
    edgesep: 40,
  });

  nodes.forEach((node) => {
    // Add nodes to dagre
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    // Add edges to dagre
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches React Flow's anchor point (top left).
    const newNode = {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};
