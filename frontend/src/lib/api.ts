/** Thin fetch wrapper around the existing Step 9 Scene API contract and the
 * existing Step 8 Physical API contract. Mirrors each backend's shape
 * exactly - no second, frontend-specific schema is introduced. */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface SceneObject {
  id: string;
  source_component_id: string;
  kind: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

export interface SceneDocument {
  source_document_id: string;
  source_schema_version: string;
  objects: SceneObject[];
}

export interface SceneError {
  code: string;
  message: string;
  path: string;
}

export interface SceneResult {
  is_valid: boolean;
  errors: SceneError[];
  warnings: SceneError[];
  scene: SceneDocument | null;
}

export async function generateScene(document: Record<string, unknown>): Promise<SceneResult> {
  const response = await fetch(`${API_BASE_URL}/api/scene/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });

  if (!response.ok) {
    throw new Error(`Scene generation request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<SceneResult>;
}

export interface PhysicalPin {
  id: string;
  source_port_id: string;
  name: string;
  direction: string;
  x: number;
  y: number;
}

export interface PhysicalBlock {
  id: string;
  source_component_id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  pins: PhysicalPin[];
}

export interface PhysicalEndpoint {
  block_id: string;
  pin_id: string;
  source_component_id: string;
  source_port_id: string;
}

export interface PhysicalNet {
  id: string;
  source_connection_id: string;
  source: PhysicalEndpoint;
  target: PhysicalEndpoint;
}

export interface PhysicalDocument {
  source_document_id: string;
  source_schema_version: string;
  die_width: number;
  die_height: number;
  blocks: PhysicalBlock[];
  nets: PhysicalNet[];
}

export interface PhysicalError {
  code: string;
  message: string;
  path: string;
}

export interface PhysicalResult {
  is_valid: boolean;
  errors: PhysicalError[];
  warnings: PhysicalError[];
  physical: PhysicalDocument | null;
}

export async function getPhysicalLayout(document: Record<string, unknown>): Promise<PhysicalResult> {
  const response = await fetch(`${API_BASE_URL}/api/physical/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });

  if (!response.ok) {
    throw new Error(`Physical layout request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<PhysicalResult>;
}

export type PromptFailureReason =
  | "missing_api_key"
  | "provider_timeout"
  | "provider_error"
  | "malformed_intent"
  | "unsupported_component_kind"
  | "invalid_connection"
  | "guardrails_rejected";

export interface PromptResolution {
  is_recognized: boolean;
  circuit_key: string | null;
  message: string;
  document: Record<string, unknown> | null;
  failure_reason: PromptFailureReason | null;
}

export async function resolvePrompt(prompt: string): Promise<PromptResolution> {
  const response = await fetch(`${API_BASE_URL}/api/prompt/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Prompt resolution request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<PromptResolution>;
}

export interface SchematicPort {
  id: string;
  source_port_id: string;
  name: string;
  direction: string;
  width: number;
  x: number;
  y: number;
}

export interface SchematicComponent {
  id: string;
  source_component_id: string;
  kind: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: SchematicPort[];
}

export interface SchematicEndpoint {
  component_id: string;
  port_id: string;
  source_component_id: string;
  source_port_id: string;
  bit_range: { msb: number; lsb: number } | null;
}

export interface RoutedPoint {
  x: number;
  y: number;
}

export interface SchematicWire {
  id: string;
  source_connection_id: string;
  source: SchematicEndpoint;
  target: SchematicEndpoint;
  points: RoutedPoint[];
}

export interface SchematicDocument {
  source_document_id: string;
  source_schema_version: string;
  components: SchematicComponent[];
  wires: SchematicWire[];
}

export interface SchematicError {
  code: string;
  message: string;
  path: string;
}

export interface SchematicResult {
  is_valid: boolean;
  errors: SchematicError[];
  warnings: SchematicError[];
  schematic: SchematicDocument | null;
}

export async function getSchematic(document: Record<string, unknown>): Promise<SchematicResult> {
  const response = await fetch(`${API_BASE_URL}/api/schematic/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });

  if (!response.ok) {
    throw new Error(`Schematic generation request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<SchematicResult>;
}

/* Step 20: real Step 19 physical-design job API - job-based (unlike the
 * synchronous Scene/Physical/Schematic contracts above), since a real
 * LibreLane build takes minutes. Mirrors app/domain/physical_design's own
 * Pydantic shapes exactly. */

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";

export type CellClassification = "canonical" | "tool_generated_fill" | "tool_generated_timing" | "unknown";

export interface PhysicalDesignError {
  code: string;
  message: string;
  path: string;
}

export interface SignoffStatus {
  drc_passed: boolean | null;
  lvs_passed: boolean | null;
  antenna_passed: boolean | null;
  drc_error_count: number | null;
  lvs_error_count: number | null;
}

export interface ComponentPhysicalMapping {
  canonical_component_id: string;
  physical_cell_names: string[];
  note: string | null;
}

export interface PortPhysicalMapping {
  canonical_component_id: string;
  def_pin_name: string;
}

export interface UnmappedCell {
  cell_name: string;
  cell_type: string;
  classification: CellClassification;
}

export interface CellPlacement {
  cell_name: string;
  cell_type: string;
  x: number;
  y: number;
  orientation: string;
  classification: CellClassification;
  canonical_component_id: string | null;
}

export interface PhysicalIdentityMapping {
  component_mappings: ComponentPhysicalMapping[];
  port_mappings: PortPhysicalMapping[];
  unmapped_cells: UnmappedCell[];
  connection_identity_status: "unavailable";
  cell_placements: CellPlacement[];
}

export interface ArtifactMetadata {
  artifact_type: string;
  file_name: string;
  size_bytes: number;
}

export interface PhysicalDesignResult {
  is_valid: boolean;
  errors: PhysicalDesignError[];
  signoff: SignoffStatus | null;
  identity_mapping: PhysicalIdentityMapping | null;
  artifacts: ArtifactMetadata[];
  metrics: Record<string, number | string | boolean | null>;
  die_width_um: number | null;
  die_height_um: number | null;
}

export interface PhysicalDesignJob {
  job_id: string;
  status: JobStatus;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
  result: PhysicalDesignResult | null;
}

const PHYSICAL_DESIGN_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function startPhysicalDesignBuild(document: Record<string, unknown>): Promise<PhysicalDesignJob> {
  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Physical design build request failed with HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<PhysicalDesignJob>;
}

export async function getPhysicalDesignJob(jobId: string): Promise<PhysicalDesignJob> {
  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error(`Physical design job status request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<PhysicalDesignJob>;
}

export async function cancelPhysicalDesignJob(jobId: string): Promise<PhysicalDesignJob> {
  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/jobs/${jobId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Physical design cancel request failed with HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<PhysicalDesignJob>;
}

export const TERMINAL_JOB_STATUSES: JobStatus[] = ["succeeded", "failed", "cancelled", "timed_out"];
export const CANCELLABLE_JOB_STATUSES: JobStatus[] = ["queued", "running"];

/* Real GDS/Silicon viewer (Step 20 follow-up). Mirrors
 * app/domain/physical_design/gds_models.py exactly - every value here
 * comes from a real klayout parse of the real GDS artifact, never
 * fabricated/derived from the DEF floorplan. */

export interface GdsBoundingBox {
  min_x_um: number;
  min_y_um: number;
  max_x_um: number;
  max_y_um: number;
}

export interface GdsLayerInfo {
  layer: number;
  datatype: number;
  known_name: string | null;
  shape_count: number;
}

export interface GdsSummary {
  dbu_um: number;
  top_cell_name: string;
  cell_count: number;
  bounding_box: GdsBoundingBox;
  layers: GdsLayerInfo[];
  total_polygon_count: number;
  total_path_count: number;
  total_box_count: number;
  total_text_count: number;
  file_size_bytes: number;
  parse_seconds: number;
}

export type GdsShapeKind = "polygon" | "path" | "box";

export interface GdsShape {
  kind: GdsShapeKind;
  points_um: [number, number][];
}

export interface GdsRegionResult {
  layer: number;
  datatype: number;
  queried_region: GdsBoundingBox;
  shapes: GdsShape[];
  returned_count: number;
  truncated: boolean;
}

export async function getGdsSummary(jobId: string): Promise<GdsSummary> {
  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/jobs/${jobId}/gds/summary`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Real GDS summary request failed with HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<GdsSummary>;
}

export interface GdsRegionQuery {
  layer: number;
  datatype: number;
  min_x_um: number;
  min_y_um: number;
  max_x_um: number;
  max_y_um: number;
  limit?: number;
}

export async function getGdsRegion(jobId: string, query: GdsRegionQuery): Promise<GdsRegionResult> {
  const params = new URLSearchParams({
    layer: String(query.layer),
    datatype: String(query.datatype),
    min_x_um: String(query.min_x_um),
    min_y_um: String(query.min_y_um),
    max_x_um: String(query.max_x_um),
    max_y_um: String(query.max_y_um),
    ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
  });

  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/jobs/${jobId}/gds/region?${params.toString()}`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Real GDS region request failed with HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<GdsRegionResult>;
}


/* Canonical identity/provenance ledger - the unified logical/HDL/physical
 * identity view. Mirrors app/domain/identity/models.py exactly; every
 * value comes from the real Step 18 HDL generator + the real Step 19
 * physical identity mapping, never fabricated. */

export type DesignLayer = "logical" | "hdl" | "physical";

export interface ComponentIdentityRecord {
  canonical_component_id: string;
  canonical_kind: string;
  canonical_name: string;
  hdl_instance_name: string | null;
  physical_cell_names: string[];
  def_pin_name: string | null;
  layers_present: DesignLayer[];
  note: string | null;
}

export interface DesignIdentityLedger {
  document_id: string;
  document_name: string;
  hdl_module_name: string | null;
  component_count: number;
  mapped_component_count: number;
  connection_identity_status: string;
  unmapped_physical_cell_count: number;
  records: ComponentIdentityRecord[];
}

export async function getDesignIdentity(jobId: string): Promise<DesignIdentityLedger> {
  const response = await fetch(`${PHYSICAL_DESIGN_API_BASE}/api/physical-design/jobs/${jobId}/identity`);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Design identity ledger request failed with HTTP ${response.status}: ${detail}`);
  }

  return response.json() as Promise<DesignIdentityLedger>;
}
