import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import api from "../services/api";
import {
  NOT_WORKING,
  SystemHealthContext,
  UNKNOWN,
  WORKING,
} from "../hooks/useSystemHealth";

/**
 * Measures the two facts the navbar states on every screen — see
 * hooks/useSystemHealth.js for what they mean and how to read them.
 *
 * Read from /system/status, the same call the dashboard makes, and the camera
 * count derived the same way as the dashboard's "Cameras connected" card: the
 * server's own capture is one camera, and every browser pushing its own camera
 * over a socket is another. Sharing the derivation is what stops the pills and
 * the card underneath them disagreeing.
 */

/** Same cadence as the dashboard's own poll, for the same reason. */
const POLL_MS = 4000;

export function SystemHealthProvider({ children }) {
  // One object rather than three pieces of state, so no render can catch
  // "reachable" updated and "status" not.
  const [health, setHealth] = useState({
    checked: false,
    reachable: false,
    status: null,
  });

  // A poll every four seconds against a client that waits fifteen would stack
  // requests on a slow link, and the newest answer is the only one worth
  // having.
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const { data } = await api.get("/system/status");
      setHealth({ checked: true, reachable: true, status: data.data });
    } catch {
      // The last known figures are dropped deliberately. They describe a
      // system we can no longer reach, and keeping them on screen is how this
      // bar came to contradict the dashboard's own outage banner.
      setHealth({ checked: true, reachable: false, status: null });
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(() => {
    const camera = health.status?.camera;
    const cameras =
      (camera?.connected ? 1 : 0) + (camera?.browser_streams ?? 0);

    return {
      checked: health.checked,
      reachable: health.reachable,
      cameras,

      system: !health.checked
        ? UNKNOWN
        : health.reachable && health.status?.backend !== false
          ? WORKING
          : NOT_WORKING,

      // Unknown while the system is unreachable, rather than "no camera": a
      // camera we cannot ask about is not a camera we have found to be off.
      camera:
        !health.checked || !health.reachable
          ? UNKNOWN
          : cameras > 0
            ? WORKING
            : NOT_WORKING,

      // The whole payload, for screens that need more than the two pills.
      status: health.status,
    };
  }, [health]);

  return (
    <SystemHealthContext.Provider value={value}>
      {children}
    </SystemHealthContext.Provider>
  );
}
