import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { CALLOUTS, JPL_AGREEMENT, REPLAYS, SHOWCASE_FACTS as F, SITE_LAT_TEXT } from "../../../lib/landing/copy";
import { computeComparisonFacts, computeLandingFacts } from "../../../lib/landing/facts";
import { pinsFromCatalog } from "../../../components/landing/MoonHeroCanvas";
import { createEngineHandlers } from "../../../workers/engineHandlers";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("landing showcase numbers equal the engine's output", () => {
  const api = createEngineHandlers(nodeFetchers);

  it("Mons Mouton window", async () => {
    const f = await computeLandingFacts(api);
    expect(Math.round(f.bothH)).toBe(F.bothH);
    expect(Math.round(f.sunlitPct)).toBe(F.sunlitPct);
    expect(Math.round(f.earthPct)).toBe(F.earthPct);
    expect(Math.floor(f.earthsetH!)).toBe(F.earthsetDays * 24 + F.earthsetHours);
    expect(f.firstSunsetH).toBeNull();
    expect(Number(f.sunElMin.toFixed(1))).toBe(F.sunElMinDeg);
    expect(Number(f.sunElMax.toFixed(1))).toBe(F.sunElMaxDeg);
    expect(Math.round(f.earthElMax)).toBe(F.earthElMaxDeg);
    expect(Math.round(f.earthAzMin)).toBe(F.earthAzMinDeg);
    expect(Math.round(f.earthAzMax)).toBe(F.earthAzMaxDeg);
    expect(Number((f.hDemM / 1000).toFixed(1))).toBe(F.refHeightKm);
  });

  it("Shackleton comparison and 14-day slip", async () => {
    const c = await computeComparisonFacts(api);
    expect(Math.round(c.shackletonBothH)).toBe(F.shackletonBothH);
    expect(c.shackletonFirstSunsetH).toBeCloseTo(F.shackletonFirstSunsetH, 1);
    expect(Math.round(c.slipBothH)).toBe(F.slipBothH);
    expect(c.slipFirstSunsetH).not.toBeNull();
    expect(c.slipFirstSunsetH!).toBeLessThan(F.slipSunsetWithinH);
    expect(c.slipSunlitH).toBeLessThan(F.slipSunsetWithinH);
  });
});

describe("landing wording", () => {
  const files = [
    "components/landing/LandingPage.tsx",
    "components/landing/MoonHeroCanvas.tsx",
    "components/landing/choreography.ts",
    "lib/landing/copy.ts",
  ];
  it.each(files)("%s has no telemetry or atmosphere claims", (file) => {
    const text = read(file);
    expect(text).not.toMatch(/telemetry/i);
    expect(text).not.toMatch(/atmospher/i);
    expect(text).not.toMatch(/corona|basin|continuous|real-time|live telemetry/i);
  });
});

describe("hero pins", () => {
  it("read coordinates from sites.json by id", () => {
    const doc = JSON.parse(read("public/data/v1/sites.json")) as {
      sites: Array<{ id: string; lat: number; lon: number }>;
    };
    const pins = pinsFromCatalog(doc.sites);
    expect(pins.length).toBe(5);
    const shack = pins.find((p) => p.id === "shackleton-rim")!;
    const site = doc.sites.find((s) => s.id === "shackleton-rim")!;
    expect(shack.lat).toBe(site.lat);
    expect(shack.lon).toBe(site.lon);
    expect(shack.label).toContain("89.7\u00b0S");
  });
});

describe("landing callouts", () => {
  const doc = JSON.parse(read("public/data/v1/sites.json")) as {
    sites: Array<{ id: string; lat: number; actual_landing_utc?: string }>;
  };
  const site = (id: string) => doc.sites.find((s) => s.id === id)!;

  it("latitudes match the catalogue", () => {
    const text = (lat: number) => `${Math.abs(lat).toFixed(1)}° ${lat < 0 ? "S" : "N"}`;
    expect(SITE_LAT_TEXT.monsMouton).toBe(text(site("im-2").lat));
    expect(SITE_LAT_TEXT.shackleton).toBe(text(site("shackleton-rim").lat));
  });

  it("hour callouts use the engine-checked values", () => {
    expect(CALLOUTS.monsMouton.fact).toBe(`${F.bothH} h Sun + Earth`);
    expect(CALLOUTS.shackleton.fact).toBe(`${F.shackletonBothH} h Sun + Earth`);
  });

  it("JPL agreement is the README's 1e-5 / 1e-4 degrees", () => {
    const readme = read("README.md");
    expect(readme).toMatch(/Sun direction agrees to about 1e-5 degrees and Earth to about 1e-4 degrees/);
    expect(JPL_AGREEMENT).toContain("0.00001° Sun");
    expect(JPL_AGREEMENT).toContain("0.0001° Earth");
  });

  it("replay buttons use the catalogue's actual landing times", () => {
    for (const r of REPLAYS) expect(site(r.id).actual_landing_utc).toBe(r.iso);
  });
});
