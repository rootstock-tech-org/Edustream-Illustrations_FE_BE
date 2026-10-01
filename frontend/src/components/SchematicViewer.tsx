"use client";

import { useState } from "react";
import type { SchematicComponent, SchematicDocument, SchematicPort, SchematicWire } from "@/lib/api";
import { useSelection } from "@/lib/selection/SelectionContext";

/** Reuses the exact same amber-selected/white-hover convention SceneViewer
 * (Step 12) already established, for visual consistency across views. */
const SELECTED_COLOR = "#ffcc00";
const HOVER_COLOR = "#ffffff";
const DEFAULT_STROKE = "#666666";
const DEFAULT_FILL = "#2a2a2a";
const DEFAULT_WIRE_COLOR = "#888888";

function computeViewBox(components: SchematicComponent[]): string {
  if (components.length === 0) {
    return "0 0 400 300";
  }
  const minX = Math.min(...components.map((component) => component.x));
  const minY = Math.min(...components.map((component) => component.y));
  const maxX = Math.max(...components.map((component) => component.x + component.width));
  const maxY = Math.max(...components.map((component) => component.y + component.height));
  const padding = 20;
  return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
}

/** A single explicit port click-target - the schematic view is the ONLY
 * view (Step 17) that supports port-level selection, since it's the only
 * one with a real per-port (x, y) to click on. */
function SchematicPortDot({ port }: { port: SchematicPort }) {
  const { selectedPortId, selectPort } = useSelection();
  const isSelected = port.source_port_id === selectedPortId;

  return (
    <circle
      cx={port.x}
      cy={port.y}
      r={isSelected ? 4 : 2.5}
      fill={isSelected ? SELECTED_COLOR : "#999999"}
      onClick={(event) => {
        event.stopPropagation();
        selectPort(port.source_port_id);
      }}
      style={{ cursor: "pointer" }}
    />
  );
}

function SchematicComponentBox({ component }: { component: SchematicComponent }) {
  const { selectedComponentId, selectComponent } = useSelection();
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = component.source_component_id === selectedComponentId;

  const stroke = isSelected ? SELECTED_COLOR : isHovered ? HOVER_COLOR : DEFAULT_STROKE;

  return (
    <g
      onClick={(event) => {
        event.stopPropagation();
        selectComponent(component.source_component_id);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: "pointer" }}
      data-testid={`schematic-component-${component.source_component_id}`}
    >
      <rect
        x={component.x}
        y={component.y}
        width={component.width}
        height={component.height}
        fill={DEFAULT_FILL}
        stroke={stroke}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      <text
        x={component.x + component.width / 2}
        y={component.y + component.height / 2}
        fill="#eeeeee"
        fontSize={10}
        textAnchor="middle"
        dominantBaseline="middle"
        pointerEvents="none"
      >
        {component.name}
      </text>
      {component.ports.map((port) => (
        <SchematicPortDot key={port.id} port={port} />
      ))}
    </g>
  );
}

function SchematicWireLine({ wire }: { wire: SchematicWire }) {
  const { selectedConnectionId, selectConnection } = useSelection();
  const isSelected = wire.source_connection_id === selectedConnectionId;
  const pointsAttribute = wire.points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <polyline
      points={pointsAttribute}
      fill="none"
      stroke={isSelected ? SELECTED_COLOR : DEFAULT_WIRE_COLOR}
      strokeWidth={isSelected ? 3 : 1.5}
      onClick={(event) => {
        event.stopPropagation();
        selectConnection(wire.source_connection_id);
      }}
      style={{ cursor: "pointer" }}
      data-testid={`schematic-wire-${wire.source_connection_id}`}
    />
  );
}

interface SchematicViewerProps {
  schematic: SchematicDocument | null;
}

/** A minimum, real, deterministic projection of the exact same
 * SchematicDocument the backend's own (already-tested) layout algorithm
 * produces - components as rectangles at their real x/y/width/height,
 * wires as their real routed polyline points. No independent drawing, no
 * fabricated layout - this IS the same schematic the backend computed,
 * just rendered as SVG instead of the backend's own SVG compiler output. */
export default function SchematicViewer({ schematic }: SchematicViewerProps) {
  const { clearSelection } = useSelection();

  if (!schematic || schematic.components.length === 0) {
    return <p>No schematic to display.</p>;
  }

  return (
    <div style={{ width: "100%", height: 480, border: "1px solid #333", background: "#111" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={computeViewBox(schematic.components)}
        onClick={() => clearSelection()}
      >
        {schematic.wires.map((wire) => (
          <SchematicWireLine key={wire.id} wire={wire} />
        ))}
        {schematic.components.map((component) => (
          <SchematicComponentBox key={component.id} component={component} />
        ))}
      </svg>
    </div>
  );
}
