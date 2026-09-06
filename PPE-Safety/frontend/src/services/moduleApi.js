/**
 * Monitoring module API client.
 *
 * The backend exposes the same endpoint surface for every module under
 * /api/<module-id>, so one factory serves all of them. A page never writes a
 * URL: it calls createModuleApi("ppe") and gets a client for that module.
 *
 * Camera controls are deliberately separate — the camera is shared
 * infrastructure, not part of any one module.
 */

import api from "./api";

/**
 * Axios progress handler reporting whole percentages.
 *
 * Falls back to the file's own size when the browser does not report a
 * total, so the bar cannot sit frozen at 0 on a link that matters most —
 * the slow one.
 */
function progressReporter(onProgress, file) {
  if (!onProgress) return undefined;

  return (event) => {
    const total = event.total || file?.size || 0;
    if (total > 0) {
      onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
    }
  };
}

/**
 * Build an API client for one monitoring module.
 *
 * @param {string} moduleId matches the backend module_id, e.g. "restricted-zone"
 */
export function createModuleApi(moduleId) {
  const base = `/api/${moduleId}`;

  return {
    moduleId,

    /** Module identity, readiness, and the camera feeding it. */
    async getStatus() {
      const { data } = await api.get(`${base}/status`);
      return data.data;
    },

    /** Latest analysis state. Safe to poll. */
    async getResults() {
      const { data } = await api.get(`${base}/results`);
      return data.data;
    },

    /** Current configuration. Only for modules that report configurable. */
    async getConfig() {
      const { data } = await api.get(`${base}/config`);
      return data.data;
    },

    /** Apply configuration. Body shape is defined by the module. */
    async saveConfig(payload) {
      const { data } = await api.post(`${base}/config`, payload);
      return data.data;
    },

    /**
     * URL for this module's annotated live view.
     *
     * MJPEG is consumed by an <img> element, so this is a URL rather than a
     * request. The timestamp forces the browser to open a new connection
     * instead of reusing a cached, already-ended stream.
     */
    streamUrl() {
      return `${api.defaults.baseURL}${base}/stream?ts=${Date.now()}`;
    },

    /**
     * Check a single photo.
     *
     * The same analysis as a live frame, run once. Findings come back as
     * geometry for the caller to draw over its own copy of the picture, and
     * anything found is written to the event history like a live sighting.
     *
     * @param {File} file the photo
     * @param {(pct: number) => void} [onProgress] upload progress, 0–100
     */
    async analysePhoto(file, onProgress) {
      const form = new FormData();
      form.append("file", file);

      const { data } = await api.post(`${base}/photo`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        // Uploads must outlive the client's ordinary timeout: over a tunnel
        // they take as long as the link says, and progress events — not a
        // clock — are the sign the request is alive.
        timeout: 0,
        onUploadProgress: progressReporter(onProgress, file),
      });

      return data.data;
    },
  };
}

/**
 * Shared camera controls.
 *
 * These wrap the original /camera endpoints, which are unchanged. Every module
 * page drives the camera through this object, so the input workflow is
 * identical everywhere.
 */
export const cameraApi = {
  async getStatus() {
    const { data } = await api.get("/camera/status");
    return data.data;
  },

  async start() {
    const { data } = await api.post("/camera/start");
    return data;
  },

  async stop() {
    const { data } = await api.post("/camera/stop");
    return data;
  },

  /**
   * Point the camera at a source.
   *
   * @param {string} source "webcam", an RTSP/HTTP URL, or a stored file path.
   */
  async setSource(source) {
    const { data } = await api.post("/camera/source", { source });
    return data;
  },

  /**
   * Upload a video file and switch to it. Images are not yet supported.
   *
   * No timeout: a recording over a tunnel takes as long as the link takes,
   * and the 15-second client default was silently killing every upload that
   * outlived it — which on a real connection was most of them.
   *
   * @param {File} file the recording
   * @param {(pct: number) => void} [onProgress] upload progress, 0–100
   */
  async uploadVideo(file, onProgress) {
    const form = new FormData();
    form.append("file", file);

    const { data } = await api.post("/camera/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 0,
      onUploadProgress: progressReporter(onProgress, file),
    });

    return data;
  },

  async snapshot() {
    const { data } = await api.post("/camera/snapshot");
    return data.data;
  },

  /** Still frame used as the backdrop while drawing a zone. */
  freezeFrameUrl() {
    return `${api.defaults.baseURL}/camera/freeze-frame?ts=${Date.now()}`;
  },

  /**
   * An uploaded recording, for the browser to play itself.
   *
   * A URL rather than a request: it goes straight into a <video>, which
   * streams it with range requests and seeks without downloading the whole
   * file first.
   */
  videoUrl(filename) {
    return `${api.defaults.baseURL}/camera/video/${encodeURIComponent(filename)}`;
  },
};

/**
 * Face recognition's register of people.
 *
 * The only module with an API beyond the shared surface: registering a
 * person is a multipart upload (name, note, photos), which has no place in
 * a JSON config call.
 */
export const facePeopleApi = {
  /** Everyone the AI has been taught to recognise. */
  async list() {
    const { data } = await api.get("/api/face/people");
    return data.data;
  },

  /**
   * Teach the AI a person.
   *
   * @param {string} name who this is
   * @param {string} crime the operator's note on why they are watched for
   * @param {File[]} photos one to five photos showing their face
   * @param {(pct: number) => void} [onProgress] upload progress, 0–100
   */
  async register(name, crime, photos, onProgress) {
    const form = new FormData();
    form.append("name", name);
    form.append("crime", crime);
    photos.forEach((photo) => form.append("photos", photo));

    const totalBytes = photos.reduce((sum, p) => sum + (p.size || 0), 0);

    const { data } = await api.post("/api/face/people", form, {
      headers: { "Content-Type": "multipart/form-data" },
      // Five phone photos over a tunnel can outlive the client's ordinary
      // timeout; the upload is done when it is done.
      timeout: 0,
      onUploadProgress: progressReporter(onProgress, { size: totalBytes }),
    });

    return data.data;
  },

  /** Remove a person; the AI stops recognising them immediately. */
  async remove(personId) {
    const { data } = await api.delete(
      `/api/face/people/${encodeURIComponent(personId)}`,
    );
    return data.data;
  },
};

/** All modules this deployment actually has, as reported by the backend. */
export async function listModules() {
  const { data } = await api.get("/api/modules");
  return data.data;
}
