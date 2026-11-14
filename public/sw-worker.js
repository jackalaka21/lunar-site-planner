// Imported by the generated service worker (workbox-config.cjs: importScripts).
// Turbopack hands the engine worker its bootstrap config in the URL fragment (#params=...). A response copied out of
// the cache carries the fragment-less URL, which makes the worker lose that config. Re-wrapping the bytes in a new
// Response (no URL of its own) keeps the worker's own URL, fragment included.
self.addEventListener("fetch", (event) => {
  if (event.request.destination !== "worker") return;
  event.respondWith(
    (async () => {
      const hit = await caches.match(event.request, { ignoreSearch: true });
      if (!hit) return fetch(event.request);
      return new Response(await hit.blob(), { status: hit.status, headers: hit.headers });
    })(),
  );
});
