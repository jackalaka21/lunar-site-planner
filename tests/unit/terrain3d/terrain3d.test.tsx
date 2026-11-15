// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LunarTerrain3D, terrainCaption } from "../../../components/terrain3d/LunarTerrain3D";
import type { TimeSeries } from "../../../lib/engine/sample";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    try {
      const b = readFileSync(join(process.cwd(), "public", url));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      };
    } catch {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  });
});

const n = 49;
const f = (fn: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => fn(i));
const series = {
  t0Ms: 0,
  stepMs: 3_600_000,
  n,
  sunAz: f((i) => (i * 7.5) % 360),
  sunEl: f((i) => 2.5 * Math.sin((i / 24) * Math.PI)),
  earthAz: f(() => 35),
  earthEl: f(() => 5.2),
} as unknown as TimeSeries;
const horizon = { stepDeg: 1, elevDeg: new Float32Array(360).fill(0.8) };

describe("LunarTerrain3D", () => {
  it("renders a 3D canvas with accessible Sun, Earth, and ridge summary and camera controls", async () => {
    render(
      <LunarTerrain3D
        horizon={horizon}
        series={series}
        cursorIndex={6}
        lat={-84.78}
        lon={29.13}
        siteId="artemis3-mons-mouton"
        obsHeightM={2}
      />,
    );
    const img = await screen.findByRole("img");
    expect(img.tagName).toBe("CANVAS");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/3D lunar terrain/);
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/Earth/);

    const povBtn = screen.getByRole("button", { name: "Lander POV" });
    expect(povBtn).toBeTruthy();
    fireEvent.click(povBtn);
    expect(screen.getByRole("button", { name: "3D Orbit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3D Orbit" }));
    expect(screen.getByRole("button", { name: "Lander POV" })).toBeTruthy();
  });

  it("offers the camera presets as buttons", async () => {
    render(
      <LunarTerrain3D
        horizon={horizon}
        series={series}
        cursorIndex={6}
        lat={-84.78}
        lon={29.13}
        siteId="artemis3-mons-mouton"
        obsHeightM={2}
      />,
    );
    await screen.findByRole("img");
    for (const name of ["Top-down", "Look at Sun", "Look at Earth", "Reset view"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Look at Earth" }));
    expect(screen.getByRole("button", { name: "3D Orbit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByRole("button", { name: "Lander POV" })).toBeTruthy();
  });

  it("shows an honest empty state for a custom point outside the south-polar grid", async () => {
    render(
      <LunarTerrain3D
        horizon={horizon}
        series={series}
        cursorIndex={6}
        lat={0.5}
        lon={10}
        obsHeightM={2}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/^3D terrain is available for catalog sites and south-polar points/),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("captions each patch with its real source and resolution", () => {
    const base = { gridSize: 101, radiusKm: 10, spacingM: 200 } as never;
    const cap = (source: string, resM: number) =>
      terrainCaption({ ...(base as object), source, resM } as never);
    expect(cap("LOLA polar 40 m", 40)).toBe("LOLA polar DEM, 20 × 20 km at 200 m (from 40 m), vertical ×3");
    expect(cap("LOLA global 64 ppd", 474)).toBe("LOLA global DEM (~470 m), 20 × 20 km, vertical ×3");
    expect(cap("LOLA 2 km grid", 2000)).toMatch(/^LOLA 2 km grid \(coarse\)/);
  });

  it("keeps the 3D terrain chunk out of the main first-view bundle", () => {
    if (!existsSync("out/index.html")) return;
    const html = readFileSync("out/index.html", "utf8");
    for (const m of html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)) {
      if (/noModule/i.test(m[0])) continue;
      const chunkPath = "out" + m[1];
      if (!existsSync(chunkPath)) continue;
      const src = readFileSync(chunkPath, "utf8");
      expect(src).not.toContain("lunar-terrain-3d");
    }
  });
});
