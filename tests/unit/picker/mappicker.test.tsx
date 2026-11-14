// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapPicker } from "../../../components/picker/MapPicker";
import { psToLatLon } from "../../../lib/data/ps";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { DEFAULT_SCENARIOS } from "../../../lib/state/defaults";
import { useAppStore } from "../../../lib/state/store";

const T0 = Date.UTC(2027, 0, 14, 6);
const pole = psToLatLon(0, 0);
const nearby = psToLatLon(4_000, 2_000);

const defaultSite = {
  id: "artemis3-mons-mouton",
  name: "Mons Mouton",
  group: "artemis3" as const,
  lat: -89.9,
  lon: 0,
  hDemM: 1200,
  source_url: "https://pgda.gsfc.nasa.gov/products/90",
  notes: "",
  horizon: "site" as const,
};

vi.mock("../../../lib/useCatalog", () => ({
  useCatalog: () => ({
    checkedUtc: "2026-11-08",
    sites: [defaultSite],
    byId: new Map([[defaultSite.id, defaultSite]]),
  }),
}));

vi.mock("../../../lib/engineClient", () => ({
  getEngine: () => ({
    heatmap: vi.fn().mockResolvedValue([
      { lat: pole.lat, lon: pole.lon, bothH: 300 },
      { lat: nearby.lat, lon: nearby.lon, bothH: 180 },
    ]),
  }),
}));

beforeEach(() => {
  useAppStore.setState({
    scenarios: DEFAULT_SCENARIOS.map((s) => ({ ...s, site: { ...s.site }, t0Ms: T0 })),
    settings: { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("overlays/psr.json")) {
        const raw = readFileSync("public/data/v1/overlays/psr.json");
        return new Response(raw, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockMapBoundingBox(svg: HTMLElement) {
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({}),
  });
}

describe("MapPicker drag, heatmap, and PSR overlay", () => {
  it("dragging pin throttles updateScenario to rAF and commits on pointerUp", () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    render(<MapPicker scenarioKey="a" mode="south" />);
    const map = screen.getByTestId("map-south");
    mockMapBoundingBox(map);

    const pin = screen.getByTestId("pin-a");
    fireEvent.pointerDown(pin, { clientX: 200, clientY: 200, pointerId: 1 });
    // Multiple moves within one frame should only queue a single rAF callback.
    fireEvent.pointerMove(map, { clientX: 180, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(map, { clientX: 160, clientY: 200, pointerId: 1 });
    expect(rafCallbacks).toHaveLength(1);

    // Flush the frame.
    const cb = rafCallbacks.shift()!;
    cb(16);
    const midSite = useAppStore.getState().scenarios[0].site;
    expect(midSite.kind).toBe("custom");

    // PointerUp commits final position immediately.
    fireEvent.pointerUp(map, { clientX: 150, clientY: 200, pointerId: 1 });
    const finalSite = useAppStore.getState().scenarios[0].site;
    expect(finalSite.kind).toBe("custom");
    if (finalSite.kind === "custom") {
      expect(finalSite.lat).toBeLessThan(-80);
    }
  });

  it("toggling Nearby heatmap (20 km) renders heatmap points and clicking a point adds a scenario", async () => {
    render(<MapPicker scenarioKey="a" mode="south" />);
    const toggle = screen.getByRole("button", { name: "Nearby heatmap (20 km)" });
    fireEvent.click(toggle);

    const layer = await screen.findByTestId("heatmap-layer");
    expect(layer).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("heatmap-point-0")).toBeTruthy();
    });

    const beforeCount = useAppStore.getState().scenarios.length;
    fireEvent.click(screen.getByTestId("heatmap-point-0"));
    const afterScenarios = useAppStore.getState().scenarios;
    expect(afterScenarios.length).toBe(beforeCount + 1);
    expect(afterScenarios[afterScenarios.length - 1].site.kind).toBe("custom");
  });

  it("toggling Permanent shadow (PSR) lazily loads and renders PSR polygons", async () => {
    render(<MapPicker scenarioKey="a" mode="south" />);
    const toggle = screen.getByRole("button", { name: "Permanent shadow (PSR)" });
    fireEvent.click(toggle);

    const layer = await screen.findByTestId("psr-layer");
    expect(layer).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("psr-polygon-psr-0")).toBeTruthy();
    });
  });
});
