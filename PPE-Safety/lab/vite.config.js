import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The lab is its own application, served on its own port in development. It
 * makes no network call of any kind — the simulation is entirely client-side
 * — so there is no API proxy here.
 */
export default defineConfig({
  // Served under /lab in production so the backend can host the lab and the
  // dashboard from one origin without either shadowing the other's routes.
  base: "/lab/",
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 5174 },
});
