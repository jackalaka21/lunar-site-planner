// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScenarioCard, type ScenarioCardProps } from "../../../components/card/ScenarioCard";
import { VerdictChip } from "../../../components/card/VerdictChip";
import { Provenance } from "../../../components/card/Provenance";
import { ToolLinks } from "../../../components/card/ToolLinks";
import type { TimeSeries } from "../../../lib/engine/sample";
import type { Metrics } from "../../../lib/engine/metrics";

afterEach(cleanup);

const n = 49;
const f = (fn: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => fn(i));
const u = (fn: (i: number) => number) => Uint8Array.from({ length: n }, (_, i) => fn(i));
const series = {
  t0Ms: Date.UTC(2026, 10, 14),
  stepMs: 3_600_000,
  n,
  sunAz: f((i) => (i * 7.5) % 360),
  sunEl: f(() => 1.4),
  sunFrac: f(() => 1),
  eclipseFrac: f(() => 0),
  earthAz: f(() => 20),
  earthEl: f(() => 4),
  earthIn: u((i) => (i < 30 ? 1 : 0)),
  interference: u(() => 0),
  power: f(() => 0.5),
  lit: u((i) => (i % 40 < 30 ? 1 : 0)),
  both: u((i) => (i < 30 ? 1 : 0)),
  dsnBits: u(() => 0),
  clippedAtMs: null,
} as unknown as TimeSeries;
const metrics: Metrics = {
  verdict: "good",
  reason: "Good: Sun and Earth together for 62% of the window",
  bothH: 127,
  bothPct: 62,
  sunlitH: 200,
  sunlitPct: 80,
  earthH: 150,
  earthPct: 70,
  longestDarkH: 20,
  longestDarkStartMs: 5 * 3_600_000,
  longestCommsGapH: 30,
  firstSunsetMs: null,
  meanPower: 0.6,
  flickersMerged: 0,
  landing: { ok: true, reason: null },
};
const horizon = { stepDeg: 1, elevDeg: new Float32Array(360).fill(0.5) };
const ctx = { lat: -89.5, lon: 0, hDemM: 0, obsHeightM: 2, horizon, source: { kind: "site" as const, id: "x", mastM: 2 as const } };
const H = 3_600_000;
const countdowns = {
  sunset: series.t0Ms + 30 * H,
  sunrise: null,
  earthset: series.t0Ms + 40 * H,
  earthrise: null,
};
const base: ScenarioCardProps = {
  scenario: { key: "a", name: "Mons Mouton", lat: -89.5, lon: 0, t0Ms: series.t0Ms },
  result: { ctx, series, metrics },
  cursorIndex: 0,
  axis: "met",
  elDomain: [-1, 6],
  flickerMergeMin: 30,
  countdowns,
  onSeek: () => {},
  onEdit: () => {},
  onRemove: () => {},
};

describe("ScenarioCard", () => {
  it("renders verdict text and both hours", () => {
    render(<ScenarioCard {...base} />);
    expect(screen.getAllByText("Good").length).toBeGreaterThan(0);
    expect(screen.getByText("127 h")).toBeTruthy();
  });
  it("shows Sunset in with the countdown", () => {
    render(<ScenarioCard {...base} />);
    expect(screen.getByText("Sunset in")).toBeTruthy();
    expect(screen.getByText("1 d 6 h")).toBeTruthy();
  });
  it("shows '> 60 d' for a null countdown", () => {
    render(<ScenarioCard {...base} countdowns={{ ...countdowns, sunset: null }} />);
    expect(screen.getByText("> 60 d")).toBeTruthy();
  });
  it("shows 'Earth never in view' when earthH = 0", () => {
    render(<ScenarioCard {...base} result={{ ctx, series, metrics: { ...metrics, earthH: 0 } }} />);
    expect(screen.getByText("Earth never in view")).toBeTruthy();
  });
  it('card 2 shows "−96 h vs A" when its bothH is 96 lower than card 1', () => {
    render(<ScenarioCard {...base} deltaVsA={{ bothH: -96, sunlitH: 12, longestDarkH: 0 }} />);
    expect(screen.getByText("\u221296 h vs A")).toBeTruthy();
  });
  it("formats positive and zero deltas", async () => {
    render(<ScenarioCard {...base} deltaVsA={{ bothH: 12, sunlitH: 0, longestDarkH: 0 }} />);
    expect(screen.getByText("+12 h vs A")).toBeTruthy();
    screen.getByRole("button", { name: "Show details" }).click();
    expect((await screen.findAllByText(/same as A/)).length).toBeGreaterThan(0);
  });
  it("card 1 shows no delta", () => {
    render(<ScenarioCard {...base} />);
    expect(screen.queryByText(/vs A/)).toBeNull();
    expect(screen.queryByText("same as A")).toBeNull();
  });
  it("all times on the card render through MissionClock (T+ format)", () => {
    const { container } = render(<ScenarioCard {...base} cursorIndex={26} />);
    expect(container.textContent).toMatch(/T\+1 d 02 h/);
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
  it("calls onEdit and onRemove from labelled icon buttons", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(<ScenarioCard {...base} onEdit={onEdit} onRemove={onRemove} />);
    screen.getByRole("button", { name: "Edit scenario A" }).click();
    screen.getByRole("button", { name: "Remove scenario A" }).click();
    expect(onEdit).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });
});

describe("VerdictChip", () => {
  it("has icon and text, not colour alone", () => {
    for (const [v, t] of [["good", "Good"], ["marginal", "Marginal"], ["poor", "Poor"]] as const) {
      const { container, unmount } = render(<VerdictChip verdict={v} reason="r" />);
      expect(screen.getByText(t)).toBeTruthy();
      expect(container.querySelector("svg")).toBeTruthy();
      unmount();
    }
  });
});

describe("Provenance", () => {
  it("shows the site profile pattern", () => {
    render(<Provenance ctx={{ source: { kind: "site", id: "x", mastM: 2 } }} />);
    expect(screen.getByText("Horizon: LOLA site profile (mast 2 m) \u00b7 Ephemeris: DE440")).toBeTruthy();
  });
  it("shows grid distance with 1 decimal", () => {
    render(<Provenance ctx={{ source: { kind: "grid", distKm: 1.23, spacingKm: 0.5 } }} />);
    expect(screen.getByText("Horizon: LOLA grid, nearest point 1.2 km \u00b7 Ephemeris: DE440")).toBeTruthy();
  });
  it("shows the sphere pattern", () => {
    render(<Provenance ctx={{ source: { kind: "sphere" } }} />);
    expect(
      screen.getByText("Horizon: smooth sphere \u2014 terrain not modelled here \u00b7 Ephemeris: DE440"),
    ).toBeTruthy();
  });
});

describe("ToolLinks", () => {
  it("builds three https links containing the coordinates (or the home URL when no deep-link format is set)", () => {
    const { container } = render(<ToolLinks lat={-89.54} lon={129.78} />);
    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    for (const a of links) {
      expect(a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("rel")).toContain("noreferrer");
    }
    expect(within(container).getByText(/Open in Quickmap/)).toBeTruthy();
    expect(within(container).getByText(/Open in Moon Trek/)).toBeTruthy();
    expect(within(container).getByText(/Check in JPL Horizons/)).toBeTruthy();
    // Without a stable deep link, the coordinates are visible for copy.
    expect(container.textContent).toContain("-89.54");
    expect(container.textContent).toContain("129.78");
  });
});
