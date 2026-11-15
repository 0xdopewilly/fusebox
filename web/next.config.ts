import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the per-wallet share card reads its fonts from disk
  outputFileTracingIncludes: { "/app/w/[address]/*": ["./assets/og/**"] },
  // The DeWEB edition (deweb/dist/index.html), previewed here until it is published to X Layer.
  async rewrites() { return [{ source: "/onchain", destination: "/onchain.html" }]; },
};

export default nextConfig;
