/**
 * Worker register and training portal API client.
 *
 * Two halves of one flow. The desk side registers workers and reads the
 * program catalog; the portal side is everything a handed-out link can do,
 * addressed by its token. The token travels in the path — it is the whole
 * of the link, and the link is the whole of the access control.
 */

import api from "./api";

export const workersApi = {
  /**
   * Register a worker; the answer carries the link to hand them.
   *
   * Multipart, because registration requires 1-5 photos. The field name
   * is the plural `photos`, repeated — the backend reads a list. The
   * timeout is raised for this one call: five phone photos through a
   * tunnel do not fit inside the app's usual fifteen seconds.
   */
  async register(fields, photos) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value ?? "");
    }
    for (const photo of photos) {
      form.append("photos", photo, photo.name || "photo.jpg");
    }
    const { data } = await api.post("/api/workers", form, { timeout: 60000 });
    return data.data;
  },

  /** Every registered worker, with program and progress. */
  async list() {
    const { data } = await api.get("/api/workers");
    return data.data;
  },

  /** Forget a worker. Their link stops answering. */
  async remove(workerId) {
    const { data } = await api.delete(
      `/api/workers/${encodeURIComponent(workerId)}`,
    );
    return data.data;
  },

  /** The training catalog, for the Programs page. */
  async programs() {
    const { data } = await api.get("/api/workers/programs");
    return data.data;
  },

  /** The quiz bank with the key — desk side only, for the Assessment page. */
  async assessments() {
    const { data } = await api.get("/api/workers/assessments");
    return data.data;
  },

  /** Everything a worker's link needs to resume where they left off. */
  async portal(token) {
    const { data } = await api.get(
      `/api/portal/${encodeURIComponent(token)}`,
    );
    return data.data;
  },

  /** Mark the training complete; the certificate comes back. */
  async complete(token) {
    const { data } = await api.post(
      `/api/portal/${encodeURIComponent(token)}/complete`,
    );
    return data.data;
  },

  /** Submit answers; the graded score card comes back. */
  async assess(token, answers) {
    const { data } = await api.post(
      `/api/portal/${encodeURIComponent(token)}/assessment`,
      { answers },
    );
    return data.data;
  },
};
