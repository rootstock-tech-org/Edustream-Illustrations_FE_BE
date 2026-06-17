import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import {
  handleRequest,
  PROTOCOL_VERSION,
  type WorkerRequest,
  type WorkerResponse,
  type SimulateResult,
} from '@/workers/protocol';
import type { MonteCarloSample } from '@/domain/simulation/montecarlo';

/**
 * Main-thread handle to the simulation worker. Correlates responses by id and
 * degrades gracefully to a synchronous in-thread computation when Workers are
 * unavailable (server rendering, tests). The UI never imports this directly —
 * it flows through the simulation store (enforced by the lint boundary).
 */
export interface SimulationBridge {
  simulate(
    deviceId: string,
    values: ParameterValues,
    options?: { sweepPoints?: number },
  ): Promise<SimulateResult>;
  monteCarlo(
    deviceId: string,
    baseValues: ParameterValues,
    count: number,
    seed: number,
  ): Promise<MonteCarloSample[]>;
  dispose(): void;
}

export function createSimulationBridge(): SimulationBridge {
  let worker: Worker | null = null;
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      worker = null; // fall back to synchronous compute
    }
  }

  let seq = 0;
  const pending = new Map<number, (r: WorkerResponse) => void>();

  if (worker) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const cb = pending.get(e.data.id);
      if (cb) {
        pending.delete(e.data.id);
        cb(e.data);
      }
    };
  }

  return {
    simulate(deviceId, values, options) {
      const id = ++seq;
      const request: WorkerRequest = {
        kind: 'simulate',
        id,
        version: PROTOCOL_VERSION,
        deviceId,
        values,
        ...(options ? { options } : {}),
      };

      if (!worker) {
        const res = handleRequest(request);
        return res.kind === 'result'
          ? Promise.resolve(res)
          : Promise.reject(new Error(res.kind === 'error' ? res.message : 'unexpected response'));
      }

      return new Promise<SimulateResult>((resolve, reject) => {
        pending.set(id, (r) =>
          r.kind === 'result' ? resolve(r) : reject(new Error(r.kind === 'error' ? r.message : 'unexpected response')),
        );
        worker!.postMessage(request);
      });
    },

    monteCarlo(deviceId, baseValues, count, seed) {
      const id = ++seq;
      const request: WorkerRequest = { kind: 'montecarlo', id, version: PROTOCOL_VERSION, deviceId, baseValues, count, seed };

      const unwrap = (r: WorkerResponse): MonteCarloSample[] => {
        if (r.kind === 'montecarlo-result') return [...r.samples];
        throw new Error(r.kind === 'error' ? r.message : 'unexpected response');
      };

      if (!worker) {
        try {
          return Promise.resolve(unwrap(handleRequest(request)));
        } catch (err) {
          return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
      }

      return new Promise<MonteCarloSample[]>((resolve, reject) => {
        pending.set(id, (r) => {
          try {
            resolve(unwrap(r));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
        worker!.postMessage(request);
      });
    },

    dispose() {
      worker?.terminate();
      pending.clear();
    },
  };
}
