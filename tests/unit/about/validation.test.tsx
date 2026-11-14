// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ValidationTable, formatValue, type ValidationEntry } from "../../../components/about/ValidationTable";

afterEach(cleanup);

const entries: ValidationEntry[] = [
  {
    name: "Passing check",
    value: 0.0123,
    reference: 0,
    tolerance: 0.05,
    pass: true,
    source_url: "https://ssd.jpl.nasa.gov/horizons/",
    unit: "deg",
    note: "Method note for the passing check.",
  },
  {
    name: "Failing check",
    value: 32.1,
    reference: 51.9,
    tolerance: 10,
    pass: false,
    source_url: "https://pgda.gsfc.nasa.gov/products/69",
    unit: "%",
    note: "Not met: honest explanation stays visible.",
  },
  {
    name: "Informational check",
    value: { sunAzDeg: 65.7, sunElDeg: 2.47 },
    reference: null,
    tolerance: null,
    pass: null,
    source_url: "https://www.nasa.gov/",
    unit: "deg",
    note: "Shown for information only.",
  },
];

describe("ValidationTable", () => {
  it("renders a row per validation entry with pass/fail icon", () => {
    render(<ValidationTable entries={entries} caption="Test section" />);
    const rows = screen.getAllByRole("row");
    // header + one row per entry
    expect(rows).toHaveLength(entries.length + 1);

    const pass = within(screen.getByText("Passing check").closest("tr") as HTMLElement);
    expect(pass.getByText("Pass")).toBeTruthy();
    expect(pass.getByText("Method note for the passing check.")).toBeTruthy();

    const fail = within(screen.getByText("Failing check").closest("tr") as HTMLElement);
    expect(fail.getByText("Fail")).toBeTruthy();
    expect(fail.getByText(/Not met: honest explanation/)).toBeTruthy();
    expect(fail.getByText(/32\.1/)).toBeTruthy();
    expect(fail.getByText(/51\.9/)).toBeTruthy();

    const info = within(screen.getByText("Informational check").closest("tr") as HTMLElement);
    expect(info.getByText("Info")).toBeTruthy();
  });

  it("formats values with units and objects", () => {
    expect(formatValue(32.1, "%")).toBe("32.1 %");
    expect(formatValue(null, null)).toBe("n/a");
    expect(formatValue({ a: 1, b: 2.5 }, "deg")).toBe("a 1, b 2.5");
    expect(formatValue("2023-09-04T06:39:00Z", null)).toBe("2023-09-04T06:39:00Z");
  });
});
