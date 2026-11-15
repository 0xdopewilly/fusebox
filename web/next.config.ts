import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The DeWEB edition (deweb/dist/index.html), previewed here until it is published to X Layer.
  async rewrites() { return [{ source: "/onchain", destination: "/onchain.html" }]; },
};

export default nextConfig;
