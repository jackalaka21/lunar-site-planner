import { describe, expect, it } from "vitest";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { createEngineHandlers } from "../../../workers/engineHandlers";

describe("engine subsolar", () => {
  const api = createEngineHandlers(nodeFetchers);
  it("returns one sub-solar latitude per day within about 1.6 degrees", async () => {
    const out = await api.subsolar({ fromMs: Date.UTC(2027, 0, 1), days: 365 });
    expect(out).toHaveLength(365);
    for (const v of out) expect(Math.abs(v)).toBeLessThan(1.7);
    expect(Math.max(...out)).toBeGreaterThan(1.2);
    expect(Math.min(...out)).toBeLessThan(-1.2);
  });
  it("nextGood honours an optional count", async () => {
    const ref = { kind: "catalog", id: "connecting-ridge" } as const;
    const { DEFAULT_SETTINGS } = await import("../../../lib/engine/settings");
    const r = await api.nextGood({ ref, fromMs: Date.UTC(2027, 0, 10), settings: DEFAULT_SETTINGS, count: 12 });
    expect(r.length).toBeGreaterThan(3);
    expect(r.length).toBeLessThanOrEqual(12);
  });
});
