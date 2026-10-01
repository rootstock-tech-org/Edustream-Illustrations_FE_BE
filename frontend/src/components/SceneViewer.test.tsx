import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { MeshStandardMaterial } from "three";
import type { PhysicalDocument, SceneDocument } from "@/lib/api";
import { SelectionProvider, useSelection } from "@/lib/selection/SelectionContext";
import { SceneContent } from "./SceneViewer";

// OrbitControls/PerspectiveCamera are irrelevant to click/selection logic
// and their continuous requestAnimationFrame-driven update loop hangs
// indefinitely under jsdom's synchronous RAF polyfill inside
// @react-three/test-renderer. Mocked out here only - Line/Text (used by
// Wire/SceneLabel, which selection logic DOES depend on) stay real.
vi.mock("@react-three/drei", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-three/drei")>();
  return {
    ...actual,
    OrbitControls: () => null,
    PerspectiveCamera: () => null,
    // Text (troika-three-text) does async, worker-based glyph layout that
    // never resolves in this test environment and is irrelevant to
    // selection logic - mocked out here only.
    Text: () => null,
  };
});

const SCENE: SceneDocument = {
  source_document_id: "doc_and_gate",
  source_schema_version: "1.0.0",
  objects: [
    { id: "scene_and1", source_component_id: "and1", kind: "AND", x: 0, y: 0, z: 0, width: 50, height: 40, depth: 20 },
    { id: "scene_in_a", source_component_id: "in_a", kind: "input", x: 70, y: 0, z: 0, width: 40, height: 40, depth: 20 },
  ],
};

const PHYSICAL: PhysicalDocument = {
  source_document_id: "doc_and_gate",
  source_schema_version: "1.0.0",
  die_width: 200,
  die_height: 100,
  blocks: [
    {
      id: "block_and1",
      source_component_id: "and1",
      kind: "AND",
      name: "AND1",
      x: 0,
      y: 0,
      width: 50,
      height: 40,
      area: 2000,
      pins: [{ id: "pin_and1_a", source_port_id: "and1.a", name: "a", direction: "input", x: 0, y: 8 }],
    },
    {
      id: "block_in_a",
      source_component_id: "in_a",
      kind: "input",
      name: "A",
      x: 70,
      y: 0,
      width: 40,
      height: 40,
      area: 1600,
      pins: [{ id: "pin_in_a_out", source_port_id: "in_a.out", name: "out", direction: "output", x: 110, y: 8 }],
    },
  ],
  nets: [
    {
      id: "net_1",
      source_connection_id: "conn_1",
      source: { block_id: "block_in_a", pin_id: "pin_in_a_out", source_component_id: "in_a", source_port_id: "in_a.out" },
      target: { block_id: "block_and1", pin_id: "pin_and1_a", source_component_id: "and1", source_port_id: "and1.a" },
    },
  ],
};

function SelectionProbe({ onChange }: { onChange: (id: string | null) => void }) {
  const { selectedComponentId } = useSelection();
  onChange(selectedComponentId);
  return null;
}

describe("SceneViewer cross-view selection", () => {
  it("clicking a 3D box selects its source_component_id", async () => {
    let captured: string | null = null;

    const renderer = await ReactThreeTestRenderer.create(
      <SelectionProvider>
        <SceneContent scene={SCENE} physical={null} />
        <SelectionProbe onChange={(id) => { captured = id; }} />
      </SelectionProvider>,
      { frameloop: "demand" },
    );

    const mesh = renderer.scene.findByProps({ name: "scene_and1" });
    await renderer.fireEvent(mesh, "click");

    expect(captured).toBe("and1");
  });

  it("externally-set global selection highlights the matching 3D box (amber emissive)", async () => {
    function ExternalSelector() {
      const { selectComponent } = useSelection();
      useEffect(() => {
        selectComponent("and1");
      }, [selectComponent]);
      return null;
    }

    const renderer = await ReactThreeTestRenderer.create(
      <SelectionProvider>
        <SceneContent scene={SCENE} physical={null} />
        <ExternalSelector />
      </SelectionProvider>,
      { frameloop: "demand" },
    );

    const mesh = renderer.scene.findByProps({ name: "scene_and1" });
    const material = mesh.findByType("MeshStandardMaterial");

    expect((material.instance as unknown as MeshStandardMaterial).emissive.getHexString()).toBe("ffcc00");
  });

  it("does not highlight a box when a different component id is selected", async () => {
    function ExternalSelector() {
      const { selectComponent } = useSelection();
      useEffect(() => {
        selectComponent("some_other_component");
      }, [selectComponent]);
      return null;
    }

    const renderer = await ReactThreeTestRenderer.create(
      <SelectionProvider>
        <SceneContent scene={SCENE} physical={null} />
        <ExternalSelector />
      </SelectionProvider>,
      { frameloop: "demand" },
    );

    const mesh = renderer.scene.findByProps({ name: "scene_and1" });
    const material = mesh.findByType("MeshStandardMaterial");

    expect((material.instance as unknown as MeshStandardMaterial).emissive.getHexString()).toBe("000000");
  });

  it("clicking a wire selects its source_connection_id", async () => {
    let capturedConnection: string | null = null;

    function ConnectionProbe() {
      const { selectedConnectionId } = useSelection();
      capturedConnection = selectedConnectionId;
      return null;
    }

    const renderer = await ReactThreeTestRenderer.create(
      <SelectionProvider>
        <SceneContent scene={SCENE} physical={PHYSICAL} />
        <ConnectionProbe />
      </SelectionProvider>,
      { frameloop: "demand" },
    );

    const wireGroup = renderer.scene.findByProps({ name: "wire_conn_1" });
    const line = wireGroup.children[0];
    await renderer.fireEvent(line, "click");

    expect(capturedConnection).toBe("conn_1");
  });
});
