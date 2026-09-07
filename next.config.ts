import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server so the desktop build needs no npm install.
  output: "standalone",
  // Pin the workspace root: a lockfile in a parent directory otherwise wins.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
