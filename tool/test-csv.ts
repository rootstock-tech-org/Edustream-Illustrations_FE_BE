// Quick test for the generic CSV writer (uses tiny sample data, no network).
// Run: node node_modules/tsx/dist/cli.mjs tool/test-csv.ts
import { writeCSV } from "./csv";

const sample = [
  { name: "IBM Quantum", focus: "Superconducting qubits, cloud", note: 'Has "commas", and stuff' },
  { name: "IonQ", focus: "Trapped-ion computers", note: "High fidelity" },
];

const path = writeCSV("test_sample.csv", sample, [
  { key: "name", header: "Name" },
  { key: "focus", header: "Focus" },
  { key: "note", header: "Note" },
]);

console.log("Wrote:", path);
