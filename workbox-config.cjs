/** Service worker for the static export (run by `npm run build` after `next build`). */
module.exports = {
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,css,woff2,webmanifest,png,svg}"],
  globIgnores: ["data/**", "landing/**", "sw.js", "sw-worker.js", "workbox-*.js"],
  swDest: "out/sw.js",
  clientsClaim: true,
  importScripts: ["sw-worker.js"],
  // No skipWaiting: a new worker waits until the page posts SKIP_WAITING (the Reload button), so a tab never
  // runs old code against new precached chunks. generateSW handles that message itself.
  // Share links carry a query string; they should still get the cached app shell offline.
  ignoreURLParametersMatching: [/.*/],
  runtimeCaching: [
    {
      // Landing media is large and decorative: fetched on demand, never precached.
      urlPattern: ({ url }) => url.pathname.startsWith("/landing/"),
      handler: "CacheFirst",
      options: {
        cacheName: "ridgeline-landing-v1",
        expiration: { maxEntries: 300 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/data/v1/"),
      handler: "CacheFirst",
      options: {
        cacheName: "ridgeline-data-v1" /* DATA_CACHE_NAME in lib/data/fetchers.ts */,
        expiration: { maxEntries: 300 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};
