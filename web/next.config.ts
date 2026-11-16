import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the per-wallet share card reads its fonts from disk
  outputFileTracingIncludes: { "/app/w/[address]/*": ["./assets/og/**"] },
  // The DeWEB edition (deweb/dist/index.html), previewed here until it is published to X Layer.
  async rewrites() { return [{ source: "/onchain", destination: "/onchain.html" }]; },
  // the service worker must never be served stale: a new deploy's push handling takes over on the next visit
  async headers() { return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] }]; },
};

export default nextConfig;
