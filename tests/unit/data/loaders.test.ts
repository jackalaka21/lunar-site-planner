import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Dsn } from "../../../lib/data/dsn";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers as f } from "../../../lib/data/nodeFetchers";
import { psToLatLon, psToXY } from "../../../lib/data/ps";
import { loadSites } from "../../../lib/data/sites";

function bytes(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("Ephemeris", () => {
  it("interpolates across year boundary", async () => {
    const e = await Ephemeris.open(f);
    await e.ensure(Date.UTC(2027, 11, 31, 22), Date.UTC(2028, 0, 1, 2));
    const a = e.bodyAt("sun", Date.UTC(2027, 11, 31, 23));
    const b = e.bodyAt("sun", Date.UTC(2028, 0, 1, 0));
    const m = e.bodyAt("sun", Date.UTC(2027, 11, 31, 23, 30));
    for (let k = 0; k < 3; k++) expect(Math.abs(m[k] - (a[k] + b[k]) / 2)).toBeLessThan(1e-6);
    const raw = new Float32Array(bytes("public/data/v1/ephemeris/2028.bin").slice(0, 24));
    expect(b[0]).toBe(raw[0]);
    const earth = e.bodyAt("earth", Date.UTC(2028, 0, 1, 0));
    expect(earth[0]).toBe(raw[3]);
  });
  it("throws outside coverage or when not loaded", async () => {
    const e = await Ephemeris.open(f);
    expect(() => e.bodyAt("sun", Date.UTC(2030, 5, 1))).toThrow(RangeError);
    await e.ensure(Date.UTC(2030, 5, 1), Date.UTC(2030, 5, 2));
    expect(() => e.bodyAt("sun", Date.UTC(2030, 5, 1, 12))).not.toThrow();
    expect(() => e.bodyAt("sun", Date.UTC(1960, 0, 1))).toThrow(RangeError);
    expect(() => e.bodyAt("sun", Date.UTC(2036, 0, 1))).toThrow(RangeError);
  });
});

describe("ps", () => {
  it("psToXY matches python", () => {
    const cases = JSON.parse(readFileSync("tests/fixtures/ps.json", "utf8")) as { lat: number; lon: number; x: number; y: number }[];
    for (const c of cases) {
      const r = psToXY(c.lat, c.lon);
      expect(r.x).toBeCloseTo(c.x, 6);
      expect(r.y).toBeCloseTo(c.y, 6);
    }
    const back = psToLatLon(2356.5675302067143, -1908.3107591071891);
    expect(back.lat).toBeCloseTo(-89.9, 9);
    expect(back.lon).toBeCloseTo(129, 7);
    expect(psToLatLon(0, 0).lon).toBe(0);
  });
});

describe("HorizonStore", () => {
  it("forPoint nearest grid point", async () => {
    const s = await HorizonStore.open(f);
    const { lat, lon } = psToLatLon(2 * 2000 + 600, 3 * 2000);
    const r = await s.forPoint(lat, lon);
    expect(r).not.toBeNull();
    if (!r || r.source.kind !== "grid") throw new Error("expected grid");
    expect(r.source.distKm).toBeCloseTo(0.6, 3);
    expect(r.source.spacingKm).toBe(2);
    const exact = await s.forPoint(...(Object.values(psToLatLon(4000, 6000)) as [number, number]));
    expect(r.profile.elevDeg).toEqual(exact?.profile.elevDeg);
    expect(r.profile.elevDeg.length).toBe(720);
    expect(r.profile.stepDeg).toBe(0.5);
  });
  it("forPoint outside grid returns null", async () => {
    const s = await HorizonStore.open(f);
    expect(await s.forPoint(-60, 10)).toBeNull();
    expect(await s.forPoint(10, 10)).toBeNull();
    expect(await s.forPoint(90, 0)).toBeNull();
  });
  it("site horizon has 3600 values", async () => {
    const s = await HorizonStore.open(f);
    const cat = await loadSites(f);
    expect(cat.sites.length).toBe(33);
    const id = cat.sites[0].id;
    const r = await s.forSite(id, 10);
    expect(r.profile.elevDeg.length).toBe(3600);
    expect(r.profile.stepDeg).toBe(0.1);
    expect(r.hDemM).toBe(cat.sites[0].hDemM);
    const raw = new Int16Array(bytes(`public/data/v1/horizons/sites/${id}.bin`));
    expect(r.profile.elevDeg[5]).toBeCloseTo(raw[3600 + 5] / 100, 5);
  });
  it("neighbours returns nodes within radius", async () => {
    const s = await HorizonStore.open(f);
    const { lat, lon } = psToLatLon(0, 0);
    const n = await s.neighbours(lat, lon, 2.5);
    expect(n.length).toBe(5);
  });
  it("resolveSiteContext handles catalog, grid and sphere", async () => {
    const s = await HorizonStore.open(f);
    const cat = await loadSites(f);
    const c = await resolveSiteContext({ kind: "catalog", id: cat.sites[0].id }, cat, s, 50);
    expect(c.source).toEqual({ kind: "site", id: cat.sites[0].id, mastM: 50 });
    expect(c.obsHeightM).toBe(50);
    const g = await resolveSiteContext({ kind: "custom", lat: -89.5, lon: 10 }, cat, s, 2);
    expect(g.source.kind).toBe("grid");
    const sp = await resolveSiteContext({ kind: "custom", lat: 10, lon: 10 }, cat, s, 2);
    expect(sp.source).toEqual({ kind: "sphere" });
    expect(sp.hDemM).toBe(0);
  });
});

describe("Dsn", () => {
  it("dsn values decode as signed", async () => {
    const d = Dsn.open(f);
    const t = Date.UTC(2026, 5, 1);
    await d.ensure(t, t + 30 * 86400000);
    let neg = 0;
    for (let h = 0; h < 720; h++) {
      const v = d.moonElDeg(t + h * 3600000);
      for (const x of v) {
        expect(x).toBeGreaterThanOrEqual(-90);
        expect(x).toBeLessThanOrEqual(90);
        if (x < 0) neg++;
      }
    }
    expect(neg).toBeGreaterThan(0);
    const raw = new Int8Array(bytes("public/data/v1/dsn/2026.bin"));
    const i = (t - Date.UTC(2026, 0, 1)) / 3600000;
    expect(d.moonElDeg(t)).toEqual([raw[3 * i], raw[3 * i + 1], raw[3 * i + 2]]);
  });
});

describe("catalogue coverage", () => {
  const NEW_IDS = ["im-3", "blue-ghost-2", "hakuto-r-m1", "hakuto-r-m2"];
  it("every site has a source, a horizon file and a terrain patch", async () => {
    const cat = await loadSites(f);
    const terrain = JSON.parse(readFileSync("public/data/v1/terrain/sites/index.json", "utf8")) as { sites: Record<string, unknown> };
    for (const s of cat.sites) {
      expect(s.source_url, s.id).toMatch(/^https:\/\//);
      expect(s.notes.trim(), s.id).not.toBe("");
      expect(readFileSync(`public/data/v1/horizons/sites/${s.id}.bin`).length, s.id).toBe(3 * 3600 * 2);
      expect(terrain.sites[s.id], s.id).toBeDefined();
    }
  });
  it("includes planned CLPS and commercial targets in the right groups", async () => {
    const cat = await loadSites(f);
    for (const id of NEW_IDS) expect(cat.byId.has(id), id).toBe(true);
    expect(cat.byId.get("im-3")?.group).toBe("clps");
    expect(cat.byId.get("blue-ghost-2")?.group).toBe("clps");
    expect(cat.byId.get("hakuto-r-m1")?.group).toBe("international");
    expect(cat.byId.get("hakuto-r-m2")?.group).toBe("international");
    expect(cat.byId.get("im-3")?.actual_landing_utc).toBeUndefined();
    expect(cat.byId.get("hakuto-r-m2")?.actual_landing_utc).toBe("2025-06-05T18:13Z");
  });
});
