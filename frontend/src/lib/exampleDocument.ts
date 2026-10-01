/** A hardcoded example Canonical IR document (identical to the backend's
 * own `and_gate_document()` fixture) - this Step 10 foundation has no
 * IR-authoring UI yet, so a fixed example is the simplest way to prove
 * the frontend can reach the backend. A future step will let a user
 * actually create/import a design. */
export const AND_GATE_EXAMPLE_DOCUMENT = {
  id: "doc_and_gate",
  schema_version: "1.0.0",
  design_version: "1",
  name: "AND Gate",
  components: [
    { id: "in_a", kind: "input", name: "A", ports: [{ id: "in_a.out", name: "out", direction: "output", width: 1 }] },
    { id: "in_b", kind: "input", name: "B", ports: [{ id: "in_b.out", name: "out", direction: "output", width: 1 }] },
    {
      id: "and1",
      kind: "AND",
      name: "AND1",
      ports: [
        { id: "and1.a", name: "a", direction: "input", width: 1 },
        { id: "and1.b", name: "b", direction: "input", width: 1 },
        { id: "and1.y", name: "y", direction: "output", width: 1 },
      ],
    },
    { id: "out_y", kind: "output", name: "Y", ports: [{ id: "out_y.in", name: "in", direction: "input", width: 1 }] },
  ],
  connections: [
    { id: "conn_1", source: { component_id: "in_a", port_id: "in_a.out" }, target: { component_id: "and1", port_id: "and1.a" } },
    { id: "conn_2", source: { component_id: "in_b", port_id: "in_b.out" }, target: { component_id: "and1", port_id: "and1.b" } },
    { id: "conn_3", source: { component_id: "and1", port_id: "and1.y" }, target: { component_id: "out_y", port_id: "out_y.in" } },
  ],
  root_component_ids: ["in_a", "in_b", "and1", "out_y"],
};
