// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MetricsBar } from "../../../components/card/MetricsBar";

afterEach(cleanup);

const rest = {
  sun: { label: "Sunset in", value: "5 d" },
  earth: { label: "Earthset in", value: "9 d" },
  sunEl: { label: "Sun elevation", value: "1.4 deg" },
};

describe("robustness band", () => {
  it('renders nominal with range in smaller type "212 h (176–230)"', () => {
    render(<MetricsBar both="212 h" robust={{ min: 176.2, max: 229.7, points: 9 }} {...rest} />);
    const bar = screen.getByTestId("metrics-bar");
    expect(bar.textContent).toContain("212 h (176–230)");
    const range = screen.getByTestId("robust-range");
    expect(range.textContent).toBe("(176–230)");
    // Range sits in its own element, separate from the nominal figure.
    expect(screen.getByText("212 h")).not.toBe(range);
  });

  it("shows the number of grid points used", () => {
    render(<MetricsBar both="212 h" robust={{ min: 176, max: 230, points: 9 }} {...rest} />);
    expect(screen.getByTestId("robust-points").textContent).toMatch(/9 points/);
  });

  it("renders only the nominal figure while robustness is pending", () => {
    render(<MetricsBar both="212 h" {...rest} />);
    expect(screen.queryByTestId("robust-range")).toBeNull();
    expect(screen.getByText("212 h")).toBeTruthy();
  });
});
