"use client";

import { useState } from "react";
import { Line, OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { PhysicalDocument, SceneDocument, SceneObject } from "@/lib/api";
import { useSelection } from "@/lib/selection/SelectionContext";

/** Simple, deterministic, presentation-only color-by-kind convention.
 * Purely client-side - the backend Scene contract has no color field and
 * is never modified to support this. */
function colorForKind(kind: string): string {
  switch (kind) {
    case "input":
      return "#4f8fdb"; // blue-ish
    case "output":
      return "#4fbf6b"; // green-ish
    default:
      return "#9a9a9a"; // neutral gray (AND/OR/NOT/unknown)
  }
}

interface SceneBoxProps {
  object: SceneObject;
}

/** Selection is amber (distinct from hover) and takes priority if both
 * apply. Step 17: selection is now the SHARED global selection (keyed by
 * the canonical source_component_id, never SceneObject.id), so a
 * component selected in another view (e.g. the schematic) highlights the
 * matching box here too. */
function SceneBox({ object }: SceneBoxProps) {
  const { selectedComponentId, selectComponent } = useSelection();
  const [isHovered, setIsHovered] = useState(false);
  const isSelected = object.source_component_id === selectedComponentId;

  const emissive = isSelected ? "#ffcc00" : isHovered ? "#ffffff" : "#000000";
  const emissiveIntensity = isSelected ? 0.6 : isHovered ? 0.25 : 0;

  return (
    <mesh
      name={object.id}
      position={[object.x, object.y, object.z]}
      onClick={(event) => {
        event.stopPropagation();
        selectComponent(object.source_component_id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setIsHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setIsHovered(false);
        document.body.style.cursor = "auto";
      }}
    >
      <boxGeometry args={[object.width, object.height, object.depth]} />
      <meshStandardMaterial
        color={colorForKind(object.kind)}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

const LABEL_OFFSET = 10; // small fixed gap above each box's rendered top face

/** Looks up the real PhysicalBlock.name for a given SceneObject via the
 * shared source_component_id - reuses the Step 13 physical fetch, no new
 * data/backend call. Returns null (never a fabricated fallback) if the
 * physical layout hasn't loaded yet or has no matching block. */
function blockNameFor(physical: PhysicalDocument | null, sourceComponentId: string): string | null {
  const block = physical?.blocks.find((candidate) => candidate.source_component_id === sourceComponentId);
  return block?.name ?? null;
}

interface SceneLabelProps {
  object: SceneObject;
  physical: PhysicalDocument | null;
}

/** A small, always-visible, plain text label above each box - purely
 * decorative, no click/hover/selection behavior of its own. object.x/y/z
 * is already the box's rendered center (same convention SceneBox itself
 * uses), so no coordinate correction is needed here - only a fixed
 * vertical offset above the box's own half-height. */
function SceneLabel({ object, physical }: SceneLabelProps) {
  const name = blockNameFor(physical, object.source_component_id);
  if (!name) {
    return null;
  }

  return (
    <Text
      position={[object.x, object.y + object.height / 2 + LABEL_OFFSET, object.z]}
      fontSize={10}
      color="#f5f5f5"
      anchorX="center"
      anchorY="bottom"
    >
      {name}
    </Text>
  );
}

const WIRE_Z = 0; // same baseline Z the boxes' own position already uses

/** Converts one PhysicalPin's corner-based absolute (x, y) into the same
 * coordinate space SceneBox actually renders in. PhysicalBlock.x/y is the
 * block's corner (verified against backend layout.py: left-side pins sit at
 * exactly block.x, right-side pins at block.x + block.width), but SceneBox
 * places a Three.js BoxGeometry - centered on its own local origin - at
 * (object.x, object.y), so the rendered box's actual center is the block's
 * corner coordinate, not its true center. Subtracting half the block's
 * width/height re-bases the pin onto that same rendered (centered) frame,
 * so a wire drawn from this position lands exactly on the rendered box's
 * edge instead of appearing to float outside it. */
function resolvePinPosition(
  physical: PhysicalDocument,
  blockId: string,
  pinId: string,
): [number, number, number] | null {
  const block = physical.blocks.find((candidate) => candidate.id === blockId);
  if (!block) {
    return null;
  }
  const pin = block.pins.find((candidate) => candidate.id === pinId);
  if (!pin) {
    return null;
  }
  return [pin.x - block.width / 2, pin.y - block.height / 2, WIRE_Z];
}

interface WireProps {
  start: [number, number, number];
  end: [number, number, number];
  sourceConnectionId: string;
}

/** A single straight, decorative connection line - no routing/bends are
 * invented; PhysicalNet itself carries no routed geometry (see backend
 * docstring), so this draws only the two real endpoints it does have.
 * Step 17: now clickable, selecting the canonical source_connection_id
 * (previously this identity was fetched but silently discarded). */
function Wire({ start, end, sourceConnectionId }: WireProps) {
  const { selectedConnectionId, selectConnection } = useSelection();
  const isSelected = sourceConnectionId === selectedConnectionId;

  return (
    <group name={`wire_${sourceConnectionId}`}>
      <Line
        points={[start, end]}
        color={isSelected ? "#ffcc00" : "#cfcfcf"}
        lineWidth={isSelected ? 3 : 1}
        onClick={(event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          selectConnection(sourceConnectionId);
        }}
      />
    </group>
  );
}

/** A simple, non-computed default camera framing: centers on the
 * bounding-box midpoint of the current objects (a few lines of
 * arithmetic, not an elaborate auto-fit system) and looks at it from a
 * fixed isometric-ish offset so a shallow, mostly-flat floorplan (all
 * current example scenes sit at z=0) is still visibly 3D on first load. */
function sceneCenter(objects: SceneObject[]): [number, number, number] {
  if (objects.length === 0) {
    return [0, 0, 0];
  }
  const minX = Math.min(...objects.map((o) => o.x));
  const maxX = Math.max(...objects.map((o) => o.x + o.width));
  const minY = Math.min(...objects.map((o) => o.y));
  const maxY = Math.max(...objects.map((o) => o.y + o.height));
  return [(minX + maxX) / 2, (minY + maxY) / 2, 0];
}

interface SceneContentProps {
  scene: SceneDocument;
  physical: PhysicalDocument | null;
}

/** The actual scene graph (camera/controls/lights/boxes/wires/labels),
 * separated from the <Canvas> wrapper so it can be rendered directly by
 * @react-three/test-renderer in tests (which provides its own implicit
 * canvas/root and cannot host a second, real @react-three/fiber <Canvas>
 * nested inside it). SceneViewer (below) is what the real app uses. */
export function SceneContent({ scene, physical }: SceneContentProps) {
  const [cx, cy, cz] = sceneCenter(scene.objects);
  const cameraPosition: [number, number, number] = [cx + 150, cy + 180, cz + 260];

  const wires = physical
    ? physical.nets
        .map((net) => {
          const start = resolvePinPosition(physical, net.source.block_id, net.source.pin_id);
          const end = resolvePinPosition(physical, net.target.block_id, net.target.pin_id);
          return start && end ? { id: net.id, start, end, sourceConnectionId: net.source_connection_id } : null;
        })
        .filter(
          (wire): wire is { id: string; start: [number, number, number]; end: [number, number, number]; sourceConnectionId: string } =>
            wire !== null,
        )
    : [];

  return (
    <>
      <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
      <OrbitControls target={[cx, cy, cz]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[200, 300, 200]} intensity={1} />
      {wires.map((wire) => (
        <Wire key={wire.id} start={wire.start} end={wire.end} sourceConnectionId={wire.sourceConnectionId} />
      ))}
      {scene.objects.map((object) => (
        <SceneBox key={object.id} object={object} />
      ))}
      {scene.objects.map((object) => (
        <SceneLabel key={`label_${object.id}`} object={object} physical={physical} />
      ))}
    </>
  );
}

interface SceneViewerProps {
  scene: SceneDocument | null;
  physical: PhysicalDocument | null;
}

export default function SceneViewer({ scene, physical }: SceneViewerProps) {
  const { clearSelection } = useSelection();

  if (!scene || scene.objects.length === 0) {
    return <p>No scene objects to display.</p>;
  }

  return (
    <div style={{ width: "100%", height: 480, border: "1px solid #333" }}>
      <Canvas onPointerMissed={() => clearSelection()}>
        <SceneContent scene={scene} physical={physical} />
      </Canvas>
    </div>
  );
}
