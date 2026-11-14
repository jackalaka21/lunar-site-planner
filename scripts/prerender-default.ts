// Build step (run by `npm run prebuild`): evaluates the default scenario once with the real engine and writes
// public/data/v1/prerender/default.json. The home page renders its first card from this file in the server HTML,
// so the card is on screen before JavaScript, the worker and the ephemeris data have loaded.
// Run by hand: npx tsx scripts/prerender-default.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sharedElDomain } from "../components/panorama/layout";
import { nodeFetcher } from "../lib/data/nodeFetchers";
import { loadSites } from "../lib/data/sites";
import { DEFAULT_SETTINGS } from "../lib/engine/settings";
import { GROUP_LABEL } from "../lib/siteGroups";
import { DEFAULT_SCENARIOS } from "../lib/state/defaults";
import { createEngineHandlers } from "../workers/engineHandlers";

const DECIMATE_TO_MS = 3_600_000;

const round = (v: number, digits: number): number => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

async function main(): Promise<void> {
  const sc = DEFAULT_SCENARIOS[0];
  const fetcher = nodeFetcher();
  const handlers = createEngineHandlers(fetcher);
  const result = await handlers.evaluate({
    ref: sc.site,
    t0Ms: sc.t0Ms,
    settings: DEFAULT_SETTINGS,
  });
  const countdowns = await handlers.countdowns({
    ref: sc.site,
    fromMs: sc.t0Ms,
    settings: DEFAULT_SETTINGS,
  });
  const catalog = await loadSites(fetcher);
  const site = sc.site.kind === "catalog" ? catalog.byId.get(sc.site.id) : undefined;
  if (!site) throw new Error("Default scenario site is not in the catalogue");

  const { series, ctx } = result;
  const every = Math.max(1, Math.round(DECIMATE_TO_MS / series.stepMs));
  const idx: number[] = [];
  for (let i = 0; i < series.n; i += every) idx.push(i);
  const pick = (a: ArrayLike<number>, digits: number) => idx.map((i) => round(a[i], digits));
  const pickInt = (a: ArrayLike<number>) => idx.map((i) => a[i]);

  const elDomain = sharedElDomain([
    { horizon: { stepDeg: ctx.horizonStepDeg, elevDeg: ctx.horizonDeg }, series },
  ]);

  const out = {
    scenario: { key: sc.key, siteId: site.id, t0Ms: sc.t0Ms },
    name: site.name,
    groupTag: GROUP_LABEL[site.group],
    ctx: {
      lat: ctx.lat,
      lon: ctx.lon,
      hDemM: ctx.hDemM,
      obsHeightM: ctx.obsHeightM,
      source: ctx.source,
      horizonStepDeg: ctx.horizonStepDeg,
      horizonDeg: Array.from(ctx.horizonDeg, (v) => round(v, 3)),
    },
    metrics: result.metrics,
    countdowns,
    elDomain,
    series: {
      t0Ms: series.t0Ms,
      stepMs: every * series.stepMs,
      n: idx.length,
      sunAz: pick(series.sunAz, 2),
      sunEl: pick(series.sunEl, 2),
      sunFrac: pick(series.sunFrac, 3),
      earthAz: pick(series.earthAz, 2),
      earthEl: pick(series.earthEl, 2),
      lit: pickInt(series.lit),
      earthIn: pickInt(series.earthIn),
      both: pickInt(series.both),
    },
  };

  const dir = path.join(process.cwd(), "public", "data", "v1", "prerender");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "default.json");
  writeFileSync(file, JSON.stringify(out) + "\n");
  console.log(
    `prerender: ${site.id} ${result.metrics.verdict} ${result.metrics.bothH} h -> ${path.relative(process.cwd(), file)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
