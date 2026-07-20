import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (avoids picking up parent lockfiles).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
