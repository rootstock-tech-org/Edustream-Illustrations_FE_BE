/**
 * Safety event history and reporting.
 *
 * Separate from the module clients: an event belongs to the site's record,
 * not to the capability that happened to spot it. The history page filters
 * across all of them, and the reports page summarises all of them together.
 */

import api from "./api";

const BASE = "/api/events";

export const DISPOSITIONS = [
  {
    value: "valid",
    label: "Real",
    description: "This happened and needed attention.",
  },
  {
    value: "false_alarm",
    label: "False alarm",
    description: "The system was wrong about this.",
  },
  {
    value: "resolved",
    label: "Dealt with",
    description: "Real, and already handled.",
  },
];

export const SEVERITIES = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const eventsApi = {
  /**
   * The history, newest first.
   *
   * @param {object} filters module, severity, acknowledged, days, limit, offset
   */
  async list(filters = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    );

    const { data } = await api.get(BASE, { params });
    return data.data;
  },

  /** The figures behind the reports page, aggregated by the server. */
  async summary(days = 7) {
    const { data } = await api.get(`${BASE}/summary`, { params: { days } });
    return data.data;
  },

  /** Sign an event off with what was concluded about it. */
  async acknowledge(id, disposition, note) {
    const { data } = await api.post(`${BASE}/${id}/acknowledge`, {
      disposition,
      note: note || null,
    });
    return data.data;
  },

  /**
   * The picture taken when the event opened.
   *
   * A URL rather than a request: it goes straight into an <img>, and the
   * browser caches it like any other image.
   */
  snapshotUrl(id) {
    return `${api.defaults.baseURL}${BASE}/${id}/snapshot`;
  },

  /**
   * Download the current filter as a spreadsheet.
   *
   * Built from the same filters the list uses, so what downloads is what was
   * on screen — an export covering a different set than the page it came from
   * is how reported numbers quietly stop matching.
   */
  exportUrl(filters = {}) {
    const params = new URLSearchParams(
      Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    );

    return `${api.defaults.baseURL}${BASE}/export.csv?${params}`;
  },

  /**
   * The same rows as an Excel workbook — typed columns, a styled header,
   * timestamps Excel can sort and pivot. Same filters, same 500-row cap.
   */
  exportXlsxUrl(filters = {}) {
    const params = new URLSearchParams(
      Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null && value !== "",
      ),
    );

    return `${api.defaults.baseURL}${BASE}/export.xlsx?${params}`;
  },
};

export default eventsApi;
