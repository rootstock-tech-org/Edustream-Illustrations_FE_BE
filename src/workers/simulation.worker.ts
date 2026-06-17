/// <reference lib="webworker" />
import { handleRequest, type WorkerRequest } from './protocol';

/**
 * Thin worker shell: delegates every message to the pure `handleRequest`
 * dispatcher (simulate | montecarlo). Keeping the logic in `protocol.ts` means
 * the heavy lifting is tested without a Worker runtime and can run
 * synchronously during SSR.
 */
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response = handleRequest(event.data);
  (self as DedicatedWorkerGlobalScope).postMessage(response);
};
