"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  generateScene,
  getPhysicalLayout,
  getSchematic,
  resolvePrompt,
  type PhysicalResult,
  type PromptFailureReason,
  type SceneObject,
  type SceneResult,
  type SchematicResult,
} from "@/lib/api";
import { AND_GATE_EXAMPLE_DOCUMENT } from "@/lib/exampleDocument";
import PhysicalDesignPanel from "@/components/PhysicalDesignPanel";
import SceneViewer from "@/components/SceneViewer";
import SchematicViewer from "@/components/SchematicViewer";
import { SelectionProvider, useSelection } from "@/lib/selection/SelectionContext";

const INFRA_FAILURE_REASONS: PromptFailureReason[] = [
  "missing_api_key",
  "provider_timeout",
  "provider_error",
];

function SceneInfoPanel({ object }: { object: SceneObject }) {
  return (
    <div style={{ background: "#111", color: "#eee", padding: "1rem", marginTop: "1rem" }}>
      <strong>Selected component</strong>
      <table style={{ marginTop: "0.5rem" }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: "1rem" }}>id</td>
            <td>{object.id}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: "1rem" }}>source_component_id</td>
            <td>{object.source_component_id}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: "1rem" }}>kind</td>
            <td>{object.kind}</td>
          </tr>
          <tr>
            <td style={{ paddingRight: "1rem" }}>x, y, z</td>
            <td>
              {object.x}, {object.y}, {object.z}
            </td>
          </tr>
          <tr>
            <td style={{ paddingRight: "1rem" }}>width, height, depth</td>
            <td>
              {object.width}, {object.height}, {object.depth}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PromptMessage({ message, failureReason }: { message: string; failureReason: PromptFailureReason | null }) {
  if (failureReason === null) {
    return <p style={{ color: "#4fbf6b" }}>{message}</p>;
  }

  const isInfraFailure = INFRA_FAILURE_REASONS.includes(failureReason);
  return (
    <p style={{ color: isInfraFailure ? "#e05555" : "#e0a04f" }}>
      {isInfraFailure ? "AI service issue: " : "Circuit generation issue: "}
      {message}
      <span style={{ opacity: 0.6 }}> [{failureReason}]</span>
    </p>
  );
}

function HomeContent() {
  // The currently displayed circuit - starts as the Step 10 hardcoded
  // AND-gate document, and is replaced only by a successfully AI-resolved
  // prompt (Step 16). Named activeDocument (not "document") to avoid
  // shadowing the global DOM `document` object.
  const [activeDocument, setActiveDocument] = useState<Record<string, unknown>>(AND_GATE_EXAMPLE_DOCUMENT);

  const [result, setResult] = useState<SceneResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [physicalResult, setPhysicalResult] = useState<PhysicalResult | null>(null);
  const [schematicResult, setSchematicResult] = useState<SchematicResult | null>(null);

  const [promptInput, setPromptInput] = useState("");
  const [promptMessage, setPromptMessage] = useState<string | null>(null);
  const [promptFailureReason, setPromptFailureReason] = useState<PromptFailureReason | null>(null);
  const [isResolvingPrompt, setIsResolvingPrompt] = useState(false);

  // Step 17: selection is now the shared, canonical-id-keyed global
  // selection - the same source_component_id is looked up here (for the
  // info panel) as in every rendered view, never a view-specific id.
  const { selectedComponentId, clearSelection } = useSelection();

  useEffect(() => {
    setResult(null);
    setError(null);
    clearSelection();

    generateScene(activeDocument)
      .then(setResult)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    // Separate fetches, same document - reuse the existing, unmodified
    // Step 8 Physical API (Step 13: wire visualization) and Step 4
    // Schematic API (Step 17: schematic view + cross-view sync).
    getPhysicalLayout(activeDocument)
      .then(setPhysicalResult)
      .catch(() => setPhysicalResult(null));
    getSchematic(activeDocument)
      .then(setSchematicResult)
      .catch(() => setSchematicResult(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument]);

  const selectedObject =
    result?.scene?.objects.find((object) => object.source_component_id === selectedComponentId) ?? null;

  async function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsResolvingPrompt(true);
    setPromptFailureReason(null);

    let resolution;
    try {
      resolution = await resolvePrompt(promptInput);
    } catch (err: unknown) {
      setPromptMessage(err instanceof Error ? err.message : String(err));
      setPromptFailureReason("provider_error");
      setIsResolvingPrompt(false);
      return;
    }

    setPromptMessage(resolution.message);
    setPromptFailureReason(resolution.failure_reason);
    // Only ever replace the displayed circuit on a genuine recognized
    // match - a failed/unrecognized prompt never fabricates/changes
    // anything, and an AI failure is always shown honestly (Step 16:
    // no silent fallback to a deterministic guess).
    if (resolution.is_recognized && resolution.document) {
      setActiveDocument(resolution.document);
    }
    setIsResolvingPrompt(false);
  }

  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 900 }}>
      <h1>VLSI Digital Twin - Scene Contract (Step 17: Cross-View Synchronization)</h1>
      <p>
        Describe a circuit in natural language (e.g. <code>&quot;Design an AND gate&quot;</code> or{" "}
        <code>&quot;Design a 2:1 multiplexer&quot;</code>). Click a component/wire in either the 3D
        view or the schematic view below - the SAME canonical component/connection becomes
        selected everywhere, since both views share one global selection keyed by the real IR
        <code>source_component_id</code>/<code>source_connection_id</code>. Click empty space in
        either view to deselect.
      </p>
      <form onSubmit={handlePromptSubmit} style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          value={promptInput}
          onChange={(event) => setPromptInput(event.target.value)}
          placeholder='e.g. "Design an AND gate" or "Design a 2:1 multiplexer"'
          style={{ width: "60%", padding: "0.5rem", fontFamily: "monospace" }}
        />
        <button type="submit" disabled={isResolvingPrompt} style={{ marginLeft: "0.5rem", padding: "0.5rem 1rem" }}>
          {isResolvingPrompt ? "Thinking..." : "Show circuit"}
        </button>
      </form>
      {promptMessage && <PromptMessage message={promptMessage} failureReason={promptFailureReason} />}
      {error && <pre style={{ color: "red" }}>Error: {error}</pre>}
      {!result && !error && <p>Loading...</p>}
      {result && result.is_valid && (
        <>
          <h2 style={{ fontSize: "1rem" }}>3D View</h2>
          <SceneViewer scene={result.scene} physical={physicalResult?.physical ?? null} />
          <h2 style={{ fontSize: "1rem" }}>Schematic View</h2>
          <SchematicViewer schematic={schematicResult?.schematic ?? null} />
          <PhysicalDesignPanel circuitDocument={activeDocument} />
        </>
      )}
      {selectedObject && <SceneInfoPanel object={selectedObject} />}
      {result && (
        <pre style={{ background: "#111", color: "#0f0", padding: "1rem", overflowX: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <SelectionProvider>
      <HomeContent />
    </SelectionProvider>
  );
}
