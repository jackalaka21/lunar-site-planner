import { describe, expect, it } from "vitest";
import { parseLanding, LANDING_COVERAGE } from "../../../components/picker/landing";

describe("parseLanding", () => {
  it("reads a UTC date and time", () => {
    const r = parseLanding("2027-01-14", "06:00");
    expect(r).toEqual({ ok: true, t0Ms: Date.UTC(2027, 0, 14, 6, 0) });
  });
  it("keeps the minutes", () => {
    expect(parseLanding("1969-07-20", "20:17")).toEqual({ ok: true, t0Ms: Date.UTC(1969, 6, 20, 20, 17) });
  });
  it("flags a bad date format on the date field", () => {
    for (const d of ["", "2027-1-14", "14/01/2027", "2027-02-30", "2027-13-01"]) {
      const r = parseLanding(d, "06:00");
      expect(r.ok, d).toBe(false);
      if (!r.ok) {
        expect(r.field).toBe("date");
        expect(r.error).toBe("Use YYYY-MM-DD");
      }
    }
  });
  it("flags a bad time on the time field", () => {
    for (const t of ["", "6:00", "24:00", "12:60", "noon", "06:00:00"]) {
      const r = parseLanding("2027-01-14", t);
      expect(r.ok, t).toBe(false);
      if (!r.ok) {
        expect(r.field).toBe("time");
        expect(r.error).toBe("Use HH:MM, 24 hour");
      }
    }
  });
  it("flags dates outside the ephemeris", () => {
    for (const [d, t] of [
      ["1968-12-31", "23:00"],
      ["2036-01-01", "00:00"],
      ["2035-12-31", "23:30"],
    ]) {
      const r = parseLanding(d, t);
      expect(r.ok, d).toBe(false);
      if (!r.ok) {
        expect(r.field).toBe("date");
        expect(r.error).toBe(LANDING_COVERAGE);
      }
    }
    expect(LANDING_COVERAGE).toBe("Ephemeris covers 1969–2035");
    expect(parseLanding("1969-01-01", "00:00").ok).toBe(true);
    expect(parseLanding("2035-12-31", "23:00").ok).toBe(true);
  });
});
