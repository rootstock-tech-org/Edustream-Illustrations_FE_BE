import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Kept as a literal: next.config is loaded before the TS path aliases exist,
// so it cannot import src/lib/basePath.ts. `basePath.test.ts` pins the two equal.
const BASE_PATH = '/probe';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Served under /probe by the same Caddy that fronts AVSAR — same origin, so
  // no second certificate and no CSP widening. Load-bearing: without it Next
  // emits assets at /_next/... which collide with AVSAR's own Vite bundle.
  basePath: BASE_PATH,
  // Emits a self-contained server + trimmed node_modules for the Docker image.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root (a stray parent lockfile otherwise confuses tracing).
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // three / R3F ship ESM that benefits from transpilation in the Next pipeline.
  transpilePackages: ['three'],
  experimental: {
    // Tree-shake heavy visualization deps so they never bloat first paint.
    optimizePackageImports: ['recharts', '@react-three/drei'],
  },
  eslint: {
    // Still set: 28 pre-existing `no-explicit-any` / unescaped-entity errors,
    // all style rather than correctness. Type errors are NOT suppressed (above);
    // this only stops a lint backlog from blocking the deploy.
    ignoreDuringBuilds: true,
  },
  // NO `typescript.ignoreBuildErrors` here, deliberately. It was set, and it was
  // hiding a real one: `Explorer.tsx` still rendered <FeedbackBar/> after that
  // component was deleted in fc3bd61, in the unconditional render path, so every
  // mount threw. `tsc --noEmit` is clean as of this commit — keep it that way.
};

export default nextConfig;
