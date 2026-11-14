import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../../../lib/engine/settings";
import { DEFAULT_SCENARIOS, MAX_SCENARIOS } from "../../../lib/state/defaults";
import { decodeState, encodeState, normaliseLon, type UrlState } from "../../../lib/state/url";

const KNOWN = new Set(["mons-mouton", "apollo-11", "chandrayaan-3"]);
const KEYS = ["a", "b", "c", "d"];

function defaultState(): UrlState {
  return { scenarios: DEFAULT_SCENARIOS.map((s) => ({ ...s })), settings: { ...DEFAULT_SETTINGS }, cursorH: 0 };
}

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomState(r: () => number): UrlState {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const n = 1 + Math.floor(r() * MAX_SCENARIOS);
  const ids = [...KNOWN];
  const scenarios = Array.from({ length: n }, (_, i) => ({
    key: KEYS[i],
    site:
      r() < 0.5
        ? ({ kind: "catalog", id: pick(ids) } as const)
        : ({
            kind: "custom",
            lat: Math.round((r() * 180 - 90) * 1000) / 1000,
            lon: Math.round(normaliseLon(r() * 360 - 180) * 1000) / 1000,
          } as const),
    t0Ms: Date.UTC(1969 + Math.floor(r() * 66), Math.floor(r() * 12), 1 + Math.floor(r() * 28), Math.floor(r() * 24), Math.floor(r() * 60)),
  }));
  const settings: Settings = {
    litThreshold: pick(["any", "half", "full"] as const),
    earthMarginDeg: Math.round(r() * 50) / 10,
    durationDays: 1 + Math.floor(r() * 30),
    batteryH: Math.floor(r() * 201),
    flickerMergeMin: Math.floor(r() * 121),
    interferenceDeg: Math.round(r() * 100) / 10,
    dsnEnabled: r() < 0.5,
    dsnMaskDeg: Math.floor(r() * 30),
    horizonUncertDeg: Math.round(r() * 20) / 10,
    ellipseKm: Math.round(r() * 100) / 10,
    mastM: pick([2, 10, 50] as const),
    panel: r() < 0.5 ? { mode: "tracking" } : { mode: "fixed", azDeg: Math.floor(r() * 360) },
    axis: pick(["met", "cal"] as const),
    displayTz: pick(["UTC", "Asia/Singapore", "America/New_York"]),
  };
  const cursorH = Math.floor(r() * settings.durationDays * 24);
  return { scenarios, settings, cursorH };
}

describe("encodeState / decodeState", () => {
  it("roundtrips random valid states with no notices", () => {
    const r = rng(42);
    for (let i = 0; i < 200; i++) {
      const state = randomState(r);
      const qs = encodeState(state);
      const out = decodeState(qs, KNOWN);
      expect(out.notices, qs).toEqual([]);
      expect(out.state, qs).toEqual(state);
    }
  });

  it("omits defaults", () => {
    const qs = encodeState(defaultState());
    expect(qs).toMatch(/^v=1&sc=[^&]+&t=0$/);
  });

  it("encodes only non-default settings", () => {
    const s = defaultState();
    s.settings.durationDays = 20;
    s.settings.panel = { mode: "fixed", azDeg: 90 };
    const qs = encodeState(s);
    expect(qs).toContain("dur=20");
    expect(qs).toContain("pan=90");
    expect(qs).not.toContain("lit=");
  });

  it("uses c:<lat>,<lon> with 3 decimals and ISO minute timestamps", () => {
    const s = defaultState();
    s.scenarios = [{ key: "a", site: { kind: "custom", lat: -89.5, lon: 10 }, t0Ms: Date.UTC(2027, 0, 1) }];
    expect(encodeState(s)).toContain("sc=c:-89.500,10.000@2027-01-01T00:00Z");
  });

  it("is empty-string safe and ignores a leading '?'", () => {
    expect(decodeState("", KNOWN)).toEqual({ state: defaultState(), notices: [] });
    expect(decodeState("?v=1", KNOWN).notices).toEqual([]);
  });

  it("treats a missing v as v1", () => {
    const out = decodeState("sc=apollo-11@2027-01-01T00:00Z&t=5", KNOWN);
    expect(out.notices).toEqual([]);
    expect(out.state.scenarios[0].site).toEqual({ kind: "catalog", id: "apollo-11" });
    expect(out.state.cursorH).toBe(5);
  });
});

describe("normaliseLon", () => {
  it("maps into [-180, 180)", () => {
    expect(normaliseLon(190)).toBe(-170);
    expect(normaliseLon(-180)).toBe(-180);
    expect(normaliseLon(180)).toBe(-180);
    expect(normaliseLon(360)).toBe(0);
    expect(normaliseLon(-190)).toBe(170);
    expect(Object.is(normaliseLon(-360), -0)).toBe(false);
  });
});

describe("decodeState tolerates garbage", () => {
  const defaultSite = DEFAULT_SCENARIOS[0].site;
  const valid = (s: UrlState) => {
    expect(s.scenarios.length).toBeGreaterThanOrEqual(1);
    expect(s.scenarios.length).toBeLessThanOrEqual(MAX_SCENARIOS);
    expect(Number.isFinite(s.cursorH)).toBe(true);
  };

  it("unknown site falls back to the default scenario", () => {
    const { state, notices } = decodeState("v=1&sc=nonexistent@2027-01-01T00:00Z", KNOWN);
    valid(state);
    expect(state.scenarios).toEqual(DEFAULT_SCENARIOS);
    expect(notices.join(" ")).toContain("Unknown site");
  });

  it("bad date keeps the site with the default date", () => {
    const { state, notices } = decodeState("sc=apollo-11@notadate", KNOWN);
    expect(state.scenarios[0].site).toEqual({ kind: "catalog", id: "apollo-11" });
    expect(state.scenarios[0].t0Ms).toBe(DEFAULT_SCENARIOS[0].t0Ms);
    expect(notices.length).toBe(1);
  });

  it("rejects calendar-invalid dates", () => {
    const { state, notices } = decodeState("sc=apollo-11@2027-02-31T00:00Z", KNOWN);
    expect(state.scenarios[0].t0Ms).toBe(DEFAULT_SCENARIOS[0].t0Ms);
    expect(notices.length).toBe(1);
  });

  it("keeps the first 4 of 5 scenarios", () => {
    const sc = Array.from({ length: 5 }, () => "apollo-11@2027-01-01T00:00Z").join(";");
    const { state, notices } = decodeState(`sc=${sc}`, KNOWN);
    expect(state.scenarios).toHaveLength(4);
    expect(state.scenarios.map((s) => s.key)).toEqual(KEYS);
    expect(notices.length).toBe(1);
  });

  it("clamps dur=999 to 30", () => {
    const { state, notices } = decodeState("dur=999", KNOWN);
    expect(state.settings.durationDays).toBe(30);
    expect(notices.length).toBe(1);
  });

  it("falls back on lit=foo", () => {
    const { state, notices } = decodeState("lit=foo", KNOWN);
    expect(state.settings.litThreshold).toBe("half");
    expect(notices.length).toBe(1);
  });

  it("reports out-of-range latitude", () => {
    const { state, notices } = decodeState("sc=c:-95,10@2027-01-01T00:00Z", KNOWN);
    valid(state);
    expect(state.scenarios[0].site).toEqual(defaultSite);
    expect(notices.join(" ")).toContain("Latitude out of range");
  });

  it("normalises custom longitude", () => {
    const { state } = decodeState("sc=c:-89,190@2027-01-01T00:00Z", KNOWN);
    expect(state.scenarios[0].site).toEqual({ kind: "custom", lat: -89, lon: -170 });
  });

  it("survives hostile junk without throwing", () => {
    const junk = [
      "sc=;;;",
      "sc=@",
      "sc=c:,@x",
      "sc=c:NaN,Infinity@2027-01-01T00:00Z",
      "t=-5&dur=abc",
      "t=NaN",
      "mast=7&pan=zzz&tz=Not/AZone",
      "dsn=maybe&em=-1&bat=1e9&fm=%&int=99&dm=x&hu=&el=-3",
      "%E0%A4%A",
      "v=99",
      "&&&=&=",
      "sc=__proto__@2027-01-01T00:00Z",
    ];
    for (const qs of junk) {
      const { state } = decodeState(qs, KNOWN);
      valid(state);
      expect(state.settings.mastM).toBe(2);
      expect(state.settings.displayTz).toBe("UTC");
    }
  });

  it("clamps the cursor to the scenario duration", () => {
    const { state, notices } = decodeState("dur=2&t=9999", KNOWN);
    expect(state.cursorH).toBe(48);
    expect(notices.length).toBe(1);
  });

  it("accepts any well-formed id when site ids are not loaded yet", () => {
    const { state, notices } = decodeState("sc=mystery-site@2027-01-01T00:00Z", null);
    expect(state.scenarios[0].site).toEqual({ kind: "catalog", id: "mystery-site" });
    expect(notices).toEqual([]);
  });
});
