// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LunarTerrain3D } from "../../../components/terrain3d/LunarTerrain3D";
import type { TimeSeries } from "../../../lib/engine/sample";

afterEach(cleanup);

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
  it("renders a 3D canvas with accessible Sun, Earth, and ridge summary and camera controls", () => {
    render(
      <LunarTerrain3D
        horizon={horizon}
        series={series}
        cursorIndex={6}
        lat={-84.78}
        lon={29.13}
        hDemM={5312.4}
        obsHeightM={2}
      />,
    );
    const img = screen.getByRole("img");
    expect(img.tagName).toBe("CANVAS");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/3D lunar terrain/);
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/Earth/);

    const povBtn = screen.getByRole("button", { name: "Lander POV" });
    expect(povBtn).toBeTruthy();
    fireEvent.click(povBtn);
    expect(screen.getByRole("button", { name: "3D Orbit" })).toBeTruthy();
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
