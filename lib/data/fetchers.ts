/** Loads a data file by path relative to `/data/v1/` and returns its bytes. */
export type Fetcher = (path: string) => Promise<ArrayBuffer>;

export const DATA_BASE = "/data/v1/";

/** Browser fetcher: same-origin static files under /data/v1/. */
export const browserFetcher: Fetcher = async (path) => {
  const res = await fetch(DATA_BASE + path);
  if (!res.ok) throw new Error(`Failed to load ${DATA_BASE}${path}: HTTP ${res.status}`);
  return res.arrayBuffer();
};

export async function fetchJson<T>(f: Fetcher, path: string): Promise<T> {
  const buf = await f(path);
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}
