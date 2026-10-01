import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionProvider, useSelection } from "./SelectionContext";

function TestConsumer() {
  const { selectedComponentId, selectedPortId, selectedConnectionId, selectComponent, selectPort, selectConnection, clearSelection } =
    useSelection();

  return (
    <div>
      <div data-testid="component">{selectedComponentId ?? "none"}</div>
      <div data-testid="port">{selectedPortId ?? "none"}</div>
      <div data-testid="connection">{selectedConnectionId ?? "none"}</div>
      <button onClick={() => selectComponent("and1")}>select-component</button>
      <button onClick={() => selectPort("and1.a")}>select-port</button>
      <button onClick={() => selectConnection("conn_1")}>select-connection</button>
      <button onClick={() => clearSelection()}>clear</button>
    </div>
  );
}

describe("SelectionContext", () => {
  it("starts with nothing selected", () => {
    render(
      <SelectionProvider>
        <TestConsumer />
      </SelectionProvider>,
    );

    expect(screen.getByTestId("component")).toHaveTextContent("none");
    expect(screen.getByTestId("port")).toHaveTextContent("none");
    expect(screen.getByTestId("connection")).toHaveTextContent("none");
  });

  it("selectComponent sets the component id and clears port/connection", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <TestConsumer />
      </SelectionProvider>,
    );

    await user.click(screen.getByText("select-port"));
    await user.click(screen.getByText("select-component"));

    expect(screen.getByTestId("component")).toHaveTextContent("and1");
    expect(screen.getByTestId("port")).toHaveTextContent("none");
    expect(screen.getByTestId("connection")).toHaveTextContent("none");
  });

  it("selectPort sets the port id and clears component/connection", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <TestConsumer />
      </SelectionProvider>,
    );

    await user.click(screen.getByText("select-component"));
    await user.click(screen.getByText("select-port"));

    expect(screen.getByTestId("port")).toHaveTextContent("and1.a");
    expect(screen.getByTestId("component")).toHaveTextContent("none");
    expect(screen.getByTestId("connection")).toHaveTextContent("none");
  });

  it("selectConnection sets the connection id and clears component/port", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <TestConsumer />
      </SelectionProvider>,
    );

    await user.click(screen.getByText("select-component"));
    await user.click(screen.getByText("select-connection"));

    expect(screen.getByTestId("connection")).toHaveTextContent("conn_1");
    expect(screen.getByTestId("component")).toHaveTextContent("none");
    expect(screen.getByTestId("port")).toHaveTextContent("none");
  });

  it("clearSelection resets everything to null", async () => {
    const user = userEvent.setup();
    render(
      <SelectionProvider>
        <TestConsumer />
      </SelectionProvider>,
    );

    await user.click(screen.getByText("select-component"));
    await user.click(screen.getByText("clear"));

    expect(screen.getByTestId("component")).toHaveTextContent("none");
    expect(screen.getByTestId("port")).toHaveTextContent("none");
    expect(screen.getByTestId("connection")).toHaveTextContent("none");
  });

  it("throws a clear error when used outside a SelectionProvider", () => {
    function Bare() {
      useSelection();
      return null;
    }
    // Suppress React's expected console.error for this intentional throw.
    const consoleSpy = () => {};
    const original = console.error;
    console.error = consoleSpy;
    expect(() => render(<Bare />)).toThrow(/SelectionProvider/);
    console.error = original;
  });
});
