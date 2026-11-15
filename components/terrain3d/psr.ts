import { browserFetcher, fetchJson } from "../../lib/data/fetchers";
import type { PsrOverlayData } from "../picker/heatmapModel";

let cached: Promise<PsrOverlayData> | null = null;

/** Load overlays/psr.json once (real PGDA zero-average-sunlight polygons). */
export function loadPsr(): Promise<PsrOverlayData> {
  if (cached) return cached;
  const job = fetchJson<PsrOverlayData>(browserFetcher, "overlays/psr.json").catch((err: unknown) => {
    if (cached === job) cached = null;
    throw err;
  });
  cached = job;
  return job;
}
