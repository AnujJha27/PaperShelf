const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open("paper-radar-shell").then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  const isShellRequest = event.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/manifest.webmanifest" || url.pathname === "/icon.svg" || url.pathname.startsWith("/assets/");
  if (!isShellRequest) return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) void caches.open("paper-radar-shell").then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
  );
});
