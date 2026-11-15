// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingCalendar } from "../../../components/calendar/LandingCalendar";
import {
  bestDays,
  distinctWindows,
  firstOfMonthMs,
  keepTimeOfDay,
  rampStep,
} from "../../../components/calendar/calendarModel";
import type { DaySummary } from "../../../lib/engine";

afterEach(cleanup);

const DAY = 86_400_000;
const H = 3_600_000;
const FROM = Date.UTC(2027, 0, 1);

function days(n: number, bothH: (i: number) => number): DaySummary[] {
  return Array.from({ length: n }, (_, i) => {
    const b = bothH(i);
    return {
      t0Ms: FROM + i * DAY,
      bothH: b,
      verdict: b >= 168 ? ("good" as const) : b < 67 ? ("poor" as const) : ("marginal" as const),
      sunlitPct: 80,
      earthPct: 70,
    };
  });
}
const sub = Array.from({ length: 365 }, (_, i) => 1.54 * Math.sin((2 * Math.PI * i) / 346.6));

function setup(over: Partial<Parameters<typeof LandingCalendar>[0]> = {}) {
  const onSelect = vi.fn();
  const props = {
    fromMs: FROM,
    days: days(365, (i) => (i % 60) * 6),
    subsolarDeg: sub,
    siteLat: -89.5,
    durationDays: 14,
    t0Ms: Date.UTC(2027, 0, 14, 6),
    onSelect,
    ...over,
  };
  render(<LandingCalendar {...props} />);
  return { onSelect };
}

describe("LandingCalendar", () => {
  it("calendar has 365 cells", () => {
    setup();
    expect(document.querySelectorAll('[data-testid^="cal-cell-"]')).toHaveLength(365);
  });

  it("click sets t0 to that day keeping the time of day", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByTestId("cal-cell-10"));
    expect(onSelect).toHaveBeenCalledWith(Date.UTC(2027, 0, 11, 6));
  });

  it("arrow keys move the focus ring and Enter selects", () => {
    const { onSelect } = setup();
    const grid = screen.getByRole("group", { name: /landing calendar/i });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown" }); // +7 days, from the landing day (14 Jan)
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(Date.UTC(2027, 0, 14 + 8, 6));
  });

  it("shows a five step legend and the footnote", () => {
    setup();
    expect(screen.getAllByTestId(/^cal-legend-/)).toHaveLength(5);
    expect(
      screen.getByText(/Good windows drift ~2\.3 days earlier each month and the pattern repeats about every 346\.6 days/),
    ).toBeTruthy();
  });

  it("labels lunar summer and winter for the site hemisphere", () => {
    setup();
    expect(screen.getByText("Lunar summer")).toBeTruthy();
    expect(screen.getByText("Lunar winter")).toBeTruthy();
  });

  it("splits the year into two half-year rows of month labels", () => {
    setup();
    const grid = screen.getByTestId("landing-calendar");
    const labels = Array.from(grid.querySelectorAll("text")).map((t) => t.textContent);
    for (const m of ["Jan 2027", "Feb", "Jun", "Jul", "Dec"]) expect(labels).toContain(m);
    const at = (k: number, attr: string) => Number(screen.getByTestId(`cal-cell-${k}`).getAttribute(attr));
    expect(at(181, "y") - at(0, "y")).toBeGreaterThan(150); // 1 Jul starts the lower half
    expect(at(181, "x")).toBeLessThan(at(60, "x")); // and restarts at the left edge
    expect(labels).toContain("Mon");
  });

  it("draws the sub-solar graph with data driven degree ticks, month ticks and the landing line", () => {
    setup();
    const g = screen.getByTestId("subsolar-graph");
    const text = Array.from(g.querySelectorAll("text")).map((t) => t.textContent);
    expect(text).toEqual(expect.arrayContaining(["+1.5°", "0°", "−1.5°", "Jan", "Dec", "Landing"]));
    expect(screen.getByText(/how far north \(\+\) or south/)).toBeTruthy();
  });

  it("states which half is summer for the site hemisphere", () => {
    setup({ siteLat: -89.5 });
    expect(screen.getByText(/summer is when the line is below 0/)).toBeTruthy();
    cleanup();
    setup({ siteLat: 70 });
    expect(screen.getByText(/summer is when the line is above 0/)).toBeTruthy();
  });

  it("shows the empty state when nothing is Good", () => {
    setup({ days: days(365, () => 10) });
    expect(screen.getByText("No Good landing in the next 365 days at this site")).toBeTruthy();
  });

  it("offers the best days as a list alternative", () => {
    const { onSelect } = setup();
    const list = screen.getByRole("list", { name: /best days/i });
    const first = list.querySelector("button");
    expect(first).toBeTruthy();
    fireEvent.click(first!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("calendar model", () => {
  it("ramp has five steps over the window", () => {
    expect(rampStep(0, 336)).toBe(0);
    expect(rampStep(336, 336)).toBe(4);
    const steps = new Set([0, 70, 120, 200, 300].map((h) => rampStep(h, 336)));
    expect(steps.size).toBe(5);
  });
  it("first of month and time of day", () => {
    expect(firstOfMonthMs(Date.UTC(2027, 0, 14, 6))).toBe(Date.UTC(2027, 0, 1));
    expect(keepTimeOfDay(Date.UTC(2027, 3, 9), Date.UTC(2027, 0, 14, 6, 30))).toBe(Date.UTC(2027, 3, 9, 6, 30));
  });
  it("distinct windows are at least 24 h apart", () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({ t0Ms: FROM + i * 6 * H }));
    const out = distinctWindows(hits, FROM - 6 * H, 3);
    expect(out.map((h) => (h.t0Ms - FROM) / H)).toEqual([0, 24, 48]);
  });
  it("drops a window that is already running at the start", () => {
    const hits = [0, 6, 12, 18, 24].map((h) => ({ t0Ms: FROM + h * H })).concat([{ t0Ms: FROM + 300 * H }]);
    const out = distinctWindows(hits, FROM, 3);
    expect(out.map((h) => h.t0Ms)).toEqual([FROM + 300 * H]);
  });
  it("best days are spread out and best first", () => {
    const d = days(365, (i) => (i === 100 || i === 101 ? 300 : i === 200 ? 250 : 10));
    const best = bestDays(d, 10);
    expect(best[0].t0Ms).toBe(FROM + 100 * DAY);
    expect(best.some((b) => b.t0Ms === FROM + 101 * DAY)).toBe(false);
    expect(best[1].t0Ms).toBe(FROM + 200 * DAY);
  });
});
