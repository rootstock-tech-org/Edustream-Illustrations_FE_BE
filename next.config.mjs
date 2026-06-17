import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

export default nextConfig;
