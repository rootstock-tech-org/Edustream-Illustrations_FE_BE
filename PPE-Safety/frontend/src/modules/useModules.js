import { useEffect, useState } from "react";

import { MODULES } from "./registry";
import { listModules } from "../services/moduleApi";

/**
 * Merge the frontend registry with what the backend actually runs.
 *
 * The registry declares what the product has; the backend catalog says what
 * this particular deployment offers. Cross-referencing them means a module can
 * be switched off server-side — or simply not installed at a given plant —
 * and the navigation reflects it without a frontend change.
 *
 * Each module comes back with:
 *   available  the backend serves it and a page exists
 *   live       the backend serves it
 *   ready      set up and able to watch — a model is loaded and configured
 *
 * Deliberately not "watching". Readiness is a property of the deployment and
 * barely changes; whether frames are arriving changes every time anyone
 * touches a camera, and this merge runs once at mount. A screen that needs to
 * know reads it from a poll of its own — see Dashboard — rather than from a
 * value fixed when the page loaded. Reporting readiness under the word
 * "watching" is what had the dashboard claiming three modules were watching
 * beside "no cameras connected".
 *
 * If the backend cannot be reached the registry is returned unchanged, so
 * navigation still works while the service is down.
 */
export function useModules() {
  const [state, setState] = useState({
    modules: MODULES.map((m) => ({
      ...m,
      live: false,
      ready: false,
      available: false,
    })),
    loading: true,
    reachable: true,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const backend = await listModules();
        if (cancelled) return;

        const byId = new Map(backend.map((m) => [m.module_id, m]));

        setState({
          modules: MODULES.map((m) => {
            const remote = byId.get(m.id);
            return {
              ...m,
              live: Boolean(remote),
              ready: Boolean(remote?.ready),
              // A module is available when the backend lists it and a page
              // exists for it, and on no other terms.
              //
              // There was an escape hatch here for pages with no backend, so
              // that a concept preview could sit in the navigation without
              // being muted as broken. Nothing uses it now — the walkways
              // module it was added for has a detector — and it is gone
              // rather than left dormant, because what it does is let a page
              // that cannot answer anything appear as a working capability.
              available: Boolean(remote) && Boolean(m.page),
              // The backend's wording wins when it has an opinion: it is the
              // thing that knows what the module actually does.
              description: remote?.description || m.description,
            };
          }),
          loading: false,
          reachable: true,
        });
      } catch {
        if (cancelled) return;

        setState((prev) => ({ ...prev, loading: false, reachable: false }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
