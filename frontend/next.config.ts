import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the dev server (accessed over Tailscale during this project's
  // remote-server development workflow) to serve HMR/dev resources.
  allowedDevOrigins: ["100.127.206.37"],
};

export default nextConfig;
