import type { NextConfig } from "next";

// Content Security Policy. Scripts and styles come only from this site (Next.js needs its inline bootstrap); wallets
// and their bridges talk over https/wss; nothing may frame the app, post forms elsewhere, or load plugins.
// A fork build (NEXT_PUBLIC_FUSEBOX_RPC=http://127.0.0.1:…) also lets the browser reach that local RPC.
const localRpc = process.env.NEXT_PUBLIC_FUSEBOX_RPC?.startsWith("http://") ? ` ${new URL(process.env.NEXT_PUBLIC_FUSEBOX_RPC).origin}` : "";
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https: wss:${localRpc}${dev ? " ws:" : ""}`,
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const SECURITY = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // the per-wallet share card reads its fonts from disk
  outputFileTracingIncludes: { "/app/w/[address]/*": ["./assets/og/**"] },
  // The DeWEB edition (deweb/dist/index.html), previewed here until it is published to X Layer.
  async rewrites() { return [{ source: "/onchain", destination: "/onchain.html" }]; },
  // the service worker must never be served stale: a new deploy's push handling takes over on the next visit
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
    ];
  },
};

export default nextConfig;
