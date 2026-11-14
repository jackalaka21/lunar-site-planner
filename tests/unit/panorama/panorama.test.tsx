// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HorizonPanorama } from "../../../components/panorama/HorizonPanorama";
import type { TimeSeries } from "../../../lib/engine/sample";

afterEach(cleanup);

const n = 49;
const f = (fn: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => fn(i));
const series = {
  t0Ms: 0,
  stepMs: 3_600_000,
  n,
  sunAz: f((i) => (i * 7.5) % 360),
  sunEl: f((i) => 3 * Math.sin((i / 24) * Math.PI)),
  earthAz: f(() => 20),
  earthEl: f(() => 4),
} as unknown as TimeSeries;
const horizon = { stepDeg: 1, elevDeg: new Float32Array(360).fill(0.5) };

describe("HorizonPanorama", () => {
  it("renders a canvas image with a Sun and Earth summary and the exaggeration label", () => {
    render(<HorizonPanorama horizon={horizon} series={series} cursorIndex={10} elDomain={[-1, 6]} />);
    const img = screen.getByRole("img");
    expect(img.tagName).toBe("CANVAS");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/Earth/);
    expect(label).toMatch(/azimuth/);
    expect(screen.getByText(/vertical ×/)).toBeTruthy();
    for (const c of ["N", "E", "S", "W"]) expect(screen.getByText(c)).toBeTruthy();
  });
  it("makes the N label focusable at a pole", () => {
    render(<HorizonPanorama horizon={horizon} series={series} cursorIndex={0} elDomain={[-1, 6]} pole />);
    expect(screen.getByText("N").getAttribute("tabindex")).toBe("0");
  });
});
