/**
 * Camera register API client.
 *
 * The register maps each camera's stable identifier to the name and location
 * an operator gave it. Identifiers travel in request bodies, not URL paths —
 * two of the three kinds (network addresses, browser device ids) are strings
 * no path segment should have to carry.
 */

import api from "./api";

export const cameraRegistryApi = {
  /** Every registered camera, plus the register's recent log. */
  async list() {
    const { data } = await api.get("/api/cameras");
    return data.data;
  },

  /** Is this identifier registered? The question the popup hangs on. */
  async lookup(cameraId) {
    const { data } = await api.post("/api/cameras/lookup", { camera_id: cameraId });
    return data.data;
  },

  /**
   * Register a camera. Name and location are both mandatory — the backend
   * refuses either blank, so the dialog's validation is a courtesy, not the
   * enforcement.
   */
  async register({ cameraId, cameraName, location, source }) {
    const { data } = await api.post("/api/cameras", {
      camera_id: cameraId,
      camera_name: cameraName,
      location,
      source,
      // The camera side's own clock, for the skew check. For a browser
      // device the browser's clock is the closest thing the camera has.
      camera_epoch_ms: Date.now(),
    });
    return data.data;
  },

  /** Edit what an operator may edit: name, location, enabled. */
  async update(cameraId, changes) {
    const { data } = await api.put(
      `/api/cameras/${encodeURIComponent(cameraId)}`,
      {
        camera_name: changes.cameraName,
        location: changes.location,
        enabled: changes.enabled,
      },
    );
    return data.data;
  },

  /** Tell the backend which camera is feeding analysis now. */
  async setContext(cameraId) {
    const { data } = await api.post("/api/cameras/context", {
      camera_id: cameraId,
      camera_epoch_ms: Date.now(),
    });
    return data.data;
  },

  /** No camera is feeding analysis any more. Fire-and-forget by callers. */
  async clearContext() {
    await api.delete("/api/cameras/context");
  },
};
