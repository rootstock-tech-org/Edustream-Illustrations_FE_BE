import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import type { AnyResult } from '@/domain/simulation/transistor/transistor.types';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { simulateTransistor } from '@/domain/simulation/transistor/transistor.engine';
import { getDevice } from '@/domain/devices/registry';
import { runMonteCarlo, type MonteCarloSample } from '@/domain/simulation/montecarlo';

export type { AnyResult } from '@/domain/simulation/transistor/transistor.types';

/**
 * Versioned, typed RPC contract between the main thread and the simulation
 * worker. All messages are discriminated unions correlated by `id`, so the
 * bridge can match responses to requests and reject on protocol-version skew.
 *
 * `runSimulation` is the pure handler — it has no `self`/Worker dependency, so
 * it is unit-testable in Node and reused as the synchronous SSR fallback.
 */
export const PROTOCOL_VERSION = 1 as const;

export interface SimulateRequest {
  readonly kind: 'simulate';
  readonly id: number;
  readonly version: number;
  readonly deviceId: string;
  readonly values: ParameterValues;
  readonly options?: { readonly sweepPoints?: number };
}

export interface MonteCarloRequest {
  readonly kind: 'montecarlo';
  readonly id: number;
  readonly version: number;
  readonly deviceId: string;
  readonly baseValues: ParameterValues;
  readonly count: number;
  readonly seed: number;
}

export type WorkerRequest = SimulateRequest | MonteCarloRequest;

export interface SimulateResult {
  readonly kind: 'result';
  readonly id: number;
  readonly version: number;
  readonly result: AnyResult;
  /** Wall-clock compute time (ms) for the perf HUD. */
  readonly elapsedMs: number;
}

export interface MonteCarloResultMsg {
  readonly kind: 'montecarlo-result';
  readonly id: number;
  readonly version: number;
  readonly samples: readonly MonteCarloSample[];
  readonly elapsedMs: number;
}

export interface SimulateError {
  readonly kind: 'error';
  readonly id: number;
  readonly version: number;
  readonly message: string;
}

export type WorkerResponse = SimulateResult | MonteCarloResultMsg | SimulateError;

// One engine instance is reused across requests (stateless, cheap to keep).
const engine = new AnalyticalEngine();

const versionError = (id: number, got: number): SimulateError => ({
  kind: 'error',
  id,
  version: PROTOCOL_VERSION,
  message: `Protocol version mismatch: got ${got}, expected ${PROTOCOL_VERSION}.`,
});

const failure = (id: number, err: unknown): SimulateError => ({
  kind: 'error',
  id,
  version: PROTOCOL_VERSION,
  message: err instanceof Error ? err.message : String(err),
});

/** Dispatch any worker request to its handler. Pure; never throws. */
export function handleRequest(request: WorkerRequest): WorkerResponse {
  if (request.version !== PROTOCOL_VERSION) return versionError(request.id, request.version);
  return request.kind === 'simulate' ? runSimulation(request) : runMonteCarloRequest(request);
}

/** Single-simulation handler. */
export function runSimulation(request: SimulateRequest): WorkerResponse {
  if (request.version !== PROTOCOL_VERSION) return versionError(request.id, request.version);
  try {
    const start = performance.now();
    const device = getDevice(request.deviceId);
    // Single transistors and gates share the same MOSFET model but different
    // surrounding circuits, so they dispatch to different solvers here.
    const result: AnyResult =
      device.kind === 'transistor'
        ? simulateTransistor(device, request.values)
        : engine.simulate({
            device,
            values: request.values,
            ...(request.options ? { options: request.options } : {}),
          });
    return { kind: 'result', id: request.id, version: PROTOCOL_VERSION, result, elapsedMs: performance.now() - start };
  } catch (err) {
    return failure(request.id, err);
  }
}

/** Monte Carlo batch handler. */
export function runMonteCarloRequest(request: MonteCarloRequest): WorkerResponse {
  try {
    const start = performance.now();
    const samples = runMonteCarlo(request.deviceId, request.baseValues, request.count, request.seed);
    return { kind: 'montecarlo-result', id: request.id, version: PROTOCOL_VERSION, samples, elapsedMs: performance.now() - start };
  } catch (err) {
    return failure(request.id, err);
  }
}
