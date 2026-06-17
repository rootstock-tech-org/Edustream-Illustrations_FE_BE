import { getConcept } from '@/domain/education/concepts';

/**
 * Compact, serializable snapshot the client sends with each tutor question.
 * Deliberately small (no 200-point sweep) — the grounding the model needs is
 * the operating point, metrics, and active concepts, not the raw arrays.
 */
export interface TutorSnapshot {
  readonly deviceName: string;
  readonly conceptIds: readonly string[];
  readonly params: ReadonlyArray<{ label: string; value: string }>;
  readonly outputs: ReadonlyArray<{ label: string; value: string }>;
  readonly regions: ReadonlyArray<{ id: string; region: string }>;
}

/** Build the grounding system message from a snapshot + relevant glossary. */
export function buildGroundingMessage(snapshot: TutorSnapshot | null): string {
  if (!snapshot) return 'CURRENT STATE\nNo active simulation.';

  const params = snapshot.params.map((p) => `  - ${p.label}: ${p.value}`).join('\n');
  const outputs = snapshot.outputs.map((o) => `  - ${o.label}: ${o.value}`).join('\n');
  const regions = snapshot.regions.map((r) => `  - ${r.id}: ${r.region}`).join('\n');

  const concepts = snapshot.conceptIds
    .map((id) => getConcept(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => `  - ${c.term}: ${c.summary}`)
    .join('\n');

  return [
    `CURRENT STATE`,
    `Device: ${snapshot.deviceName}`,
    ``,
    `Parameters:`,
    params || '  (none)',
    ``,
    `Outputs:`,
    outputs || '  (none)',
    ``,
    `Transistor regions:`,
    regions || '  (none)',
    ``,
    `Relevant concepts:`,
    concepts || '  (none)',
  ].join('\n');
}
