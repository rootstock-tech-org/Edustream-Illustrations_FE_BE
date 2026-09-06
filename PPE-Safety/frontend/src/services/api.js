import axios from "axios";

/**
 * HTTP client.
 *
 * The base URL is empty by default, so every request is same-origin. That is
 * what makes single-port hosting work: the backend serves the built dashboard
 * and its own API from one address, so there is no CORS to negotiate and
 * nothing to reconfigure when the address changes — which matters behind a
 * tunnel, where the hostname is different every session.
 *
 * In development the two run on separate ports; vite.config.js proxies the API
 * paths to the backend, so requests are same-origin there too.
 *
 * Set VITE_API_BASE at build time only when the API genuinely lives elsewhere.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "",
  timeout: 15000,
});

export default api;
