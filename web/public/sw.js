// Fusebox's service worker: shows an approver's alerts and opens the right approval when one is tapped. No caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Fusebox", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Fusebox", {
    body: d.body || "", tag: d.tag || "fusebox", renotify: true, requireInteraction: true,
    icon: "/icon-192.png", badge: "/badge-72.png", data: { url: d.url || "/app/approve" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app/approve", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (new URL(w.url).origin === self.location.origin && "focus" in w) { await w.focus(); if ("navigate" in w) await w.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
