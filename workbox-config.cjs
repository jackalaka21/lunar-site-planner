/** Service worker for the static export (run by `npm run build` after `next build`). */
module.exports = {
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,css,woff2,webmanifest,png,svg}"],
  globIgnores: ["data/**", "sw.js", "workbox-*.js"],
  swDest: "out/sw.js",
  clientsClaim: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.pathname.startsWith("/data/v1/"),
      handler: "CacheFirst",
      options: {
        cacheName: "ridgeline-data-v1",
        expiration: { maxEntries: 300 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};
