// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "../../../components/timeline/Timeline";
import {
  sample,
  siteFrame,
  sphereHorizon,
  toRad,
  type EphemerisSource,
  type SiteContext,
  type StationSource,
  type TimeSeries,
  type Vec3,
} from "../../../lib/engine";
import type { Metrics } from "../../../lib/engine/metrics";
import { DEFAULT_SETTINGS, type Settings } from "../../../lib/engine/settings";

afterEach(cleanup);

const ctx: SiteContext = {
  lat: 0,
  lon: 0,
  hDemM: 0,
  obsHeightM: 2,
  horizon: sphereHorizon(2),
  source: { kind: "sphere" },
};
const f = siteFrame(0, 0, 0, 2);
const up = (el: number): Vec3 => [
  Math.sin(toRad(el)) * f.u[0] + Math.cos(toRad(el)) * f.e[0],
  Math.sin(toRad(el)) * f.u[1] + Math.cos(toRad(el)) * f.e[1],
  Math.sin(toRad(el)) * f.u[2] + Math.cos(toRad(el)) * f.e[2],
];
// Earth 30 deg above the horizon for the whole window, Sun 20 deg.
const eph: EphemerisSource = {
  coverage: () => [0, 1e13],
  bodyAt: (b) => {
    const d = up(b === "sun" ? 20 : 30);
    const r = b === "sun" ? 1.496e8 : 384400;
    return [f.p[0] + r * d[0], f.p[1] + r * d[1], f.p[2] + r * d[2]];
  },
};
const HOUR = 3_600_000;
/** Goldstone sees the Moon for hours 0-5, nobody for 6-11, Canberra for 12-23. */
const dsn: StationSource = {
  moonElDeg: (t) => {
    const h = Math.floor(t / HOUR);
    if (h < 6) return [40, -20, -30];
    if (h < 12) return [-5, -5, 5];
    return [-30, -10, 25];
  },
};
const on: Settings = { ...DEFAULT_SETTINGS, dsnEnabled: true, dsnMaskDeg: 10 };

describe("dsn ground-station layer", () => {
  it("dsn disabled leaves earthIn unchanged", () => {
    const base = sample(ctx, eph, 0, 24, 60, DEFAULT_SETTINGS);
    const withDsn = sample(ctx, eph, 0, 24, 60, DEFAULT_SETTINGS, dsn);
    expect(Array.from(withDsn.earthIn)).toEqual(Array.from(base.earthIn));
    expect(base.earthIn.every((v) => v === 1)).toBe(true);
    expect(withDsn.dsnBits.every((v) => v === 0)).toBe(true);
  });

  it("dsn enabled ANDs station coverage", () => {
    const s = sample(ctx, eph, 0, 24, 60, on, dsn);
    expect(Array.from(s.earthIn.slice(0, 6))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(Array.from(s.earthIn.slice(6, 12))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.earthIn[12]).toBe(1);
    expect(s.dsnBits[0]).toBe(0b001);
    expect(s.dsnBits[12]).toBe(0b100);
    const strict = sample(ctx, eph, 0, 24, 60, { ...on, dsnMaskDeg: 30 }, dsn);
    expect(strict.earthIn[0]).toBe(1);
    expect(strict.earthIn[12]).toBe(0);
  });

  it("timeline shows station initials G/M/C over covered spans", () => {
    const s: TimeSeries = sample(ctx, eph, 0, 24, 60, on, dsn);
    const multi: StationSource = { moonElDeg: (t) => (t < 8 * HOUR ? [40, 5, 5] : t < 16 * HOUR ? [5, 40, 5] : [5, 5, 40]) };
    const s2 = sample(ctx, eph, 0, 24, 60, on, multi);
    const m = { longestDarkStartMs: null, longestDarkH: 0 } as unknown as Metrics;
    const props = { metrics: m, cursorIndex: 0, axis: "met" as const, flickerMergeMin: 0, onSeek: () => {} };
    render(<Timeline series={s2} {...props} />);
    const labels = screen.getAllByTestId("dsn-station").map((e) => e.textContent);
    expect(labels).toEqual(["G", "M", "C"]);
    cleanup();
    render(<Timeline series={s} {...props} />);
    expect(screen.getAllByTestId("dsn-station").map((e) => e.textContent)).toEqual(["G", "C"]);
    cleanup();
    render(<Timeline series={sample(ctx, eph, 0, 24, 60, DEFAULT_SETTINGS, dsn)} {...props} />);
    expect(screen.queryAllByTestId("dsn-station")).toHaveLength(0);
  });
});
