import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // Pin the root so Next never picks up the lockfile in the parent Coding Projects folder.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
