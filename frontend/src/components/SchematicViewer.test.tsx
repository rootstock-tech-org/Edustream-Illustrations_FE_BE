import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SchematicDocument } from "@/lib/api";
import { SelectionProvider, useSelection } from "@/lib/selection/SelectionContext";
import SchematicViewer from "./SchematicViewer";

const SCHEMATIC: SchematicDocument = {
  source_document_id: "doc_and_gate",
  source_schema_version: "1.0.0",
  components: [
    {
      id: "sch_and1",
      source_component_id: "and1",
      kind: "AND",
      name: "AND1",
      x: 100,
      y: 50,
      width: 40,
      height: 30,
      ports: [
        { id: "sch_and1.a", source_port_id: "and1.a", name: "a", direction: "input", width: 1, x: 100, y: 55 },
        { id: "sch_and1.y", source_port_id: "and1.y", name: "y", direction: "output", width: 1, x: 140, y: 65 },
      ],
    },
    {
      id: "sch_in_a",
      source_component_id: "in_a",
      kind: "input",
      name: "A",
      x: 0,
      y: 50,
      width: 20,
      height: 20,
      ports: [{ id: "sch_in_a.out", source_port_id: "in_a.out", name: "out", direction: "output", width: 1, x: 20, y: 60 }],
    },
  ],
  wires: [
    {
      id: "sch_conn_1",
      source_connection_id: "conn_1",
      source: { component_id: "sch_in_a", port_id: "sch_in_a.out", source_component_id: "in_a", source_port_id: "in_a.out", bit_range: null },
      target: { component_id: "sch_and1", port_id: "sch_and1.a", source_component_id: "and1", source_port_id: "and1.a", bit_range: null },
      points: [
        { x: 20, y: 60 },
        { x: 100, y: 55 },
      ],
    },
  ],
};

function SelectionProbe() {
  const { selectedComponentId, selectedPortId, selectedConnectionId } = useSelection();
  return (
    <div>
      <div data-testid="probe-component">{selectedComponentId ?? "none"}</div>
      <div data-testid="probe-port">{selectedPortId ?? "none"}</div>
      <div data-testid="probe-connection">{selectedConnectionId ?? "none"}</div>
    </div>
  );
}

function renderWithProvider(children: React.ReactNode) {
  return render(<SelectionProvider>{children}</SelectionProvider>);
}

describe("SchematicViewer", () => {
  it("clicking a component selects its source_component_id", () => {
    renderWithProvider(
      <>
        <SchematicViewer schematic={SCHEMATIC} />
        <SelectionProbe />
      </>,
    );

    fireEvent.click(screen.getByTestId("schematic-component-and1"));

    expect(screen.getByTestId("probe-component")).toHaveTextContent("and1");
  });

  it("clicking a wire selects its source_connection_id", () => {
    renderWithProvider(
      <>
        <SchematicViewer schematic={SCHEMATIC} />
        <SelectionProbe />
      </>,
    );

    fireEvent.click(screen.getByTestId("schematic-wire-conn_1"));

    expect(screen.getByTestId("probe-connection")).toHaveTextContent("conn_1");
  });

  it("clicking empty svg space clears selection", () => {
    const { container } = renderWithProvider(
      <>
        <SchematicViewer schematic={SCHEMATIC} />
        <SelectionProbe />
      </>,
    );

    fireEvent.click(screen.getByTestId("schematic-component-and1"));
    expect(screen.getByTestId("probe-component")).toHaveTextContent("and1");

    const svg = container.querySelector("svg");
    if (!svg) throw new Error("svg not found");
    fireEvent.click(svg);

    expect(screen.getByTestId("probe-component")).toHaveTextContent("none");
  });

  it("renders with the amber selected color when selectedComponentId matches externally", () => {
    function ExternalSelector() {
      const { selectComponent } = useSelection();
      return <button onClick={() => selectComponent("and1")}>select-externally</button>;
    }

    renderWithProvider(
      <>
        <ExternalSelector />
        <SchematicViewer schematic={SCHEMATIC} />
      </>,
    );

    fireEvent.click(screen.getByText("select-externally"));

    const rect = screen.getByTestId("schematic-component-and1").querySelector("rect");
    expect(rect).toHaveAttribute("stroke", "#ffcc00");
  });

  it("does not highlight a component when a different id is selected", () => {
    function ExternalSelector() {
      const { selectComponent } = useSelection();
      return <button onClick={() => selectComponent("some_other_component")}>select-other</button>;
    }

    renderWithProvider(
      <>
        <ExternalSelector />
        <SchematicViewer schematic={SCHEMATIC} />
      </>,
    );

    fireEvent.click(screen.getByText("select-other"));

    const rect = screen.getByTestId("schematic-component-and1").querySelector("rect");
    expect(rect).not.toHaveAttribute("stroke", "#ffcc00");
  });

  it("hovering a component does not mutate the persistent global selection", () => {
    renderWithProvider(
      <>
        <SchematicViewer schematic={SCHEMATIC} />
        <SelectionProbe />
      </>,
    );

    fireEvent.click(screen.getByTestId("schematic-component-and1"));
    expect(screen.getByTestId("probe-component")).toHaveTextContent("and1");

    fireEvent.mouseEnter(screen.getByTestId("schematic-component-in_a"));
    fireEvent.mouseLeave(screen.getByTestId("schematic-component-in_a"));

    // Hover on a DIFFERENT component must never change the persistent
    // selection - hover and selection are deliberately separate states.
    expect(screen.getByTestId("probe-component")).toHaveTextContent("and1");
  });

  it("shows a fallback message when there is no schematic", () => {
    renderWithProvider(<SchematicViewer schematic={null} />);
    expect(screen.getByText("No schematic to display.")).toBeInTheDocument();
  });
});
