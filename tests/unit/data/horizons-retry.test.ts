import { describe, expect, it } from "vitest";
import type { Fetcher } from "../../../lib/data/fetchers";
import { HorizonStore } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { psToLatLon } from "../../../lib/data/ps";

/** Fetcher that fails the first request whose path matches, then delegates. */
function flaky(match: (p: string) => boolean): { f: Fetcher; failures: () => number } {
  let failed = 0;
  const f: Fetcher = async (p) => {
    if (match(p) && failed === 0) {
      failed++;
      throw new Error("transient network error");
    }
    return nodeFetchers(p);
  };
  return { f, failures: () => failed };
}

describe("HorizonStore retries after a transient failure", () => {
  it("grid tile", async () => {
    const { f, failures } = flaky((p) => p.startsWith("horizons/grid/") && p.endsWith(".bin"));
    const s = await HorizonStore.open(f);
    const { lat, lon } = psToLatLon(0, 0);
    await expect(s.forPoint(lat, lon)).rejects.toThrow("transient");
    const r = await s.forPoint(lat, lon);
    expect(r).not.toBeNull();
    expect(failures()).toBe(1);
  });

  it("site file", async () => {
    const { f } = flaky((p) => p.startsWith("horizons/sites/"));
    const s = await HorizonStore.open(f);
    await expect(s.forSite("apollo-11", 2)).rejects.toThrow("transient");
    const r = await s.forSite("apollo-11", 2);
    expect(r.profile.elevDeg.length).toBe(3600);
  });

  it("site catalog", async () => {
    const { f } = flaky((p) => p === "sites.json");
    const s = await HorizonStore.open(f);
    await expect(s.forSite("apollo-11", 2)).rejects.toThrow("transient");
    const r = await s.forSite("apollo-11", 2);
    expect(r.profile.stepDeg).toBe(0.1);
  });
});
