import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * In development the dashboard and the backend run on separate ports, so the
 * API paths are proxied. That keeps every request same-origin in dev exactly
 * as it is in production, where the backend serves the built dashboard itself
 * — no CORS difference between the two, and no separate base URL to keep in
 * step.
 */
const BACKEND = process.env.VITE_BACKEND_ORIGIN || "http://127.0.0.1:8000";

const API_PATHS = ["/api", "/camera", "/restricted-area", "/system", "/health"];

const proxy = Object.fromEntries(
  API_PATHS.map((path) => [
    path,
    // ws:true so the browser-camera WebSocket survives the dev proxy.
    { target: BACKEND, changeOrigin: true, ws: true },
  ]),
);

/*
 * The Lab page mounts the teaching simulation that lives in `lab/`, rather
 * than keeping a second copy of it here. One source, two apps: the engine's
 * thresholds and its 200-odd tests stay in `lab/`, and anything fixed there
 * is fixed on this page too. `fs.allow` lets the dev server read that far up
 * the tree; the production build inlines it like any other import.
 */
const LAB_SRC = fileURLToPath(new URL("../lab/src", import.meta.url));

/**
 * Where the shared packages actually live.
 *
 * Node resolves a bare import by walking up from the file that wrote it, so
 * `import { useState } from "react"` inside `lab/src` looks in
 * `lab/node_modules` and never in this app's. On a machine where the lab has
 * had its own `npm install` that silently works; on a fresh clone — a Colab
 * runtime, CI, anyone who has only installed this app — the build fails to
 * resolve React at all.
 *
 * Pointing the shared packages at this app's own copies fixes that, and buys
 * something worth having anyway: one React in the bundle rather than two,
 * which is the difference between hooks working and hooks throwing.
 */
const own = (pkg) => fileURLToPath(new URL(`./node_modules/${pkg}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@lab": LAB_SRC,
      // Matched exactly or as a path prefix, so "react/jsx-runtime" follows
      // "react" here while "react-dom" keeps its own entry.
      react: own("react"),
      "react-dom": own("react-dom"),
      "lucide-react": own("lucide-react"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: { proxy, fs: { allow: [".", LAB_SRC] } },
  preview: { proxy },
});
