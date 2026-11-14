/** Loads a data file by path relative to `/data/v1/` and returns its bytes. */
export type Fetcher = (path: string) => Promise<ArrayBuffer>;

export const DATA_BASE = "/data/v1/";

/** Name of the service worker's runtime cache for data files. Keep in sync with workbox-config.cjs. */
export const DATA_CACHE_NAME = "ridgeline-data-v1";

/**
 * On a first visit nothing controls the page yet, so the service worker never sees these requests. Store the
 * response ourselves in the same cache, so a reload while offline still has the data the first view used.
 */
function cacheForOffline(url: string, res: Response): void {
  try {
    if (typeof caches === "undefined" || navigator.serviceWorker?.controller) return;
    const copy = res.clone();
    void caches
      .open(DATA_CACHE_NAME)
      .then((c) => c.put(url, copy))
      .catch(() => undefined);
  } catch {
    // caching is an optimisation only
  }
}

/** Browser fetcher: same-origin static files under /data/v1/. */
export const browserFetcher: Fetcher = async (path) => {
  const url = DATA_BASE + path;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  cacheForOffline(url, res);
  return res.arrayBuffer();
};

export async function fetchJson<T>(f: Fetcher, path: string): Promise<T> {
  const buf = await f(path);
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}
