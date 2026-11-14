import { describe, expect, it } from "vitest";
import prerender from "../../../public/data/v1/prerender/default.json";
import { nodeFetcher } from "../../../lib/data/nodeFetchers";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { isDefaultState } from "../../../lib/state/isDefault";
import { DEFAULT_SCENARIOS } from "../../../lib/state/defaults";
import { createEngineHandlers } from "../../../workers/engineHandlers";

describe("isDefaultState", () => {
  const base = { scenarios: DEFAULT_SCENARIOS, settings: DEFAULT_SETTINGS, cursorH: 0 };
  it("is true for the default view", () => expect(isDefaultState(base)).toBe(true));
  it("is false when anything differs", () => {
    expect(isDefaultState({ ...base, cursorH: 3 })).toBe(false);
    expect(isDefaultState({ ...base, settings: { ...DEFAULT_SETTINGS, batteryH: 30 } })).toBe(
      false,
    );
    expect(isDefaultState({ ...base, scenarios: [{ ...DEFAULT_SCENARIOS[0], t0Ms: 0 }] })).toBe(
      false,
    );
    expect(
      isDefaultState({
        ...base,
        scenarios: [...DEFAULT_SCENARIOS, { ...DEFAULT_SCENARIOS[0], key: "b" }],
      }),
    ).toBe(false);
  });
});

describe("default prerender", () => {
  it("is the engine's result for the default scenario (re-run scripts/prerender-default.ts if this fails)", async () => {
    const sc = DEFAULT_SCENARIOS[0];
    const r = await createEngineHandlers(nodeFetcher()).evaluate({
      ref: sc.site,
      t0Ms: sc.t0Ms,
      settings: DEFAULT_SETTINGS,
    });
    expect(prerender.scenario.t0Ms).toBe(sc.t0Ms);
    expect(prerender.metrics.bothH).toBeCloseTo(r.metrics.bothH, 6);
    expect(prerender.metrics.verdict).toBe(r.metrics.verdict);
    expect(prerender.series.stepMs).toBe(3_600_000);
    expect(prerender.series.sunEl).toHaveLength(prerender.series.n);
  }, 60_000);
});
