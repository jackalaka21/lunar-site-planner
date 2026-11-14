// Prints the first Good landing time for the default demo site (artemis3-mons-mouton; the plain mons-mouton point is never Good at default settings) from 2027-01-01.
// Run: npx tsx scripts/pick-default-date.ts
import { nodeFetcher } from "../lib/data/nodeFetchers";
import { createEngineHandlers } from "../workers/engineHandlers";
import { DEFAULT_SETTINGS } from "../lib/engine/settings";

async function main(): Promise<void> {
  const FROM_MS = Date.UTC(2027, 0, 1);
  const handlers = createEngineHandlers(nodeFetcher());
  const ref = { kind: "catalog", id: "artemis3-mons-mouton" } as const;
  const good = await handlers.nextGood({ ref, fromMs: FROM_MS, settings: DEFAULT_SETTINGS });
  if (good.length === 0) {
    console.log("No Good date found within 365 days");
    process.exit(1);
  }
  const t0Ms = good[0].t0Ms;
  const r = await handlers.evaluate({ ref, t0Ms, settings: DEFAULT_SETTINGS });
  console.log(JSON.stringify({ t0Ms, iso: new Date(t0Ms).toISOString(), verdict: r.metrics.verdict, bothH: r.metrics.bothH, reason: r.metrics.reason }, null, 2));
  console.log("all:", good.map((g) => new Date(g.t0Ms).toISOString()).join(", "));

}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
