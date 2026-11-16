import type { MetadataRoute } from "next";

/** Installable as an app, so approvers get alerts on their phones (iOS delivers web push only to installed apps). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fusebox", short_name: "Fusebox", id: "/app/approve",
    description: "Approve your agents' payments, watch their wallets, and get an alert when a payment waits on your signature.",
    start_url: "/app/approve", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#000000", theme_color: "#000000", categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Approvals", url: "/app/approve", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "My wallets", url: "/app/mine", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
