// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SitePicker, matchSites } from "../../../components/picker/SitePicker";
import { formatLatLon, siteMeta, siteSearchMeta } from "../../../components/picker/SiteList";
import type { Site } from "../../../lib/data/sites";
import { DEFAULT_SCENARIOS } from "../../../lib/state/defaults";
import { useAppStore } from "../../../lib/state/store";

const base = { source_url: "https://example.org", notes: "", horizon: "site" as const, hDemM: 0 };
const eagle: Site = {
  ...base,
  id: "apollo-11",
  name: "Apollo 11 Eagle",
  group: "apollo",
  lat: 0.67,
  lon: 23.47,
  actual_landing_utc: "1969-07-20T20:17:40Z",
};
const a12: Site = { ...eagle, id: "apollo-12", name: "Apollo 12 Intrepid", lat: -3.01, lon: -23.42, actual_landing_utc: "1969-11-19T06:54:35Z" };
const mouton: Site = { ...base, id: "artemis3-mons-mouton", name: "Mons Mouton", group: "artemis3", lat: -89.9, lon: 0 };
const sites = [eagle, a12, mouton];

vi.mock("../../../lib/useCatalog", () => ({
  useCatalog: () => ({ checkedUtc: "2026-11-08", sites, byId: new Map(sites.map((s) => [s.id, s])) }),
}));
vi.mock("../../../lib/engineClient", () => ({ getEngine: () => ({ heatmap: vi.fn().mockResolvedValue([]) }) }));

afterEach(cleanup);

function mount() {
  useAppStore.setState({ scenarios: DEFAULT_SCENARIOS });
  return render(<SitePicker scenarioKey="a" />);
}

describe("formatting", () => {
  it("uses N/S and E/W", () => {
    expect(formatLatLon(eagle)).toBe("0.67° N, 23.47° E");
    expect(formatLatLon(a12)).toBe("3.01° S, 23.42° W");
  });
  it("shows the year only when there is a landing date", () => {
    expect(siteMeta(eagle)).toBe("1969 · 0.67° N, 23.47° E");
    expect(siteMeta(mouton)).toBe("89.90° S, 0.00° E");
    expect(siteSearchMeta(eagle)).toBe("Apollo · 1969 · 0.67° N, 23.47° E");
  });
});

describe("SiteList", () => {
  it("renders category headers as non-buttons with site counts", () => {
    mount();
    const list = screen.getByTestId("site-list");
    const header = within(list).getByTestId("site-group-header-apollo");
    expect(header.tagName).not.toBe("BUTTON");
    expect(within(header).queryByRole("button")).toBeNull();
    expect(within(header).getByText("Apollo")).toBeTruthy();
    expect(within(header).getByText("2 sites")).toBeTruthy();
    expect(within(list).getByTestId("site-group-header-artemis3").textContent).toContain("1 site");
    expect(within(list).queryByRole("button", { name: /^Apollo$/ })).toBeNull();
  });

  it("shows metadata on each row and keeps aria-pressed", () => {
    mount();
    const list = screen.getByTestId("site-list");
    const row = within(list).getByRole("button", { name: /Apollo 11 Eagle/ });
    expect(row.textContent).toContain("1969 · 0.67° N, 23.47° E");
    expect(row.getAttribute("aria-pressed")).toBe("false");
    const cand = within(list).getByRole("button", { name: /Mons Mouton/ });
    expect(cand.textContent).toContain("89.90° S, 0.00° E");
    expect(cand.textContent).not.toMatch(/\d{4} ·/);
    fireEvent.click(row);
    expect(within(list).getByRole("button", { name: /Apollo 11 Eagle/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("carries the tour hook on the picker root", () => {
    mount();
    expect(screen.getByTestId("site-picker").getAttribute("data-tour-id")).toBe("tour-site-picker");
  });
});

describe("search results", () => {
  it("show category, year and coordinates as secondary text, and no selectable category", async () => {
    mount();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "apollo" } });
    const opts = await waitFor(() => {
      const o = screen.getAllByRole("option");
      expect(o.length).toBe(2);
      return o;
    });
    expect(opts[0].textContent).toContain("Apollo 11 Eagle");
    expect(opts[0].textContent).toContain("Apollo · 1969 · 0.67° N, 23.47° E");
    expect(screen.queryByRole("option", { name: /^Apollo$/ })).toBeNull();
  });
});

describe("matchSites ordering", () => {
  it("lists matches by category order, keeping catalogue order within a category", () => {
    const out = matchSites([mouton, a12, eagle], "o");
    expect(out.map((s) => s.id)).toEqual(["apollo-12", "apollo-11", "artemis3-mons-mouton"]);
  });
});

describe("row icons", () => {
  it("use a crosshair for candidate and polar groups and a pin for the rest, regardless of date", () => {
    mount();
    const list = screen.getByTestId("site-list");
    const iconOf = (re: RegExp) => within(list).getByRole("button", { name: re }).querySelector("svg")?.getAttribute("class") ?? "";
    expect(iconOf(/Apollo 11 Eagle/)).toContain("lucide-map-pin");
    expect(iconOf(/Mons Mouton/)).toContain("lucide-crosshair");
  });
});
