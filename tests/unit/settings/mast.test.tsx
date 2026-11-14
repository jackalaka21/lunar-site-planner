// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Provenance, provenanceText } from "../../../components/card/Provenance";
import { MAST_DISABLED_MESSAGE, SettingsPanel } from "../../../components/settings/SettingsPanel";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { DEFAULT_SCENARIOS } from "../../../lib/state/defaults";
import { useAppStore } from "../../../lib/state/store";
import { createEngineHandlers } from "../../../workers/engineHandlers";

const T0 = Date.UTC(2027, 0, 14, 6);

beforeEach(() => {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.show = proto.showModal;
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  useAppStore.setState({
    scenarios: DEFAULT_SCENARIOS.map((s) => ({ ...s, site: { ...s.site } })),
    settings: { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel } },
  });
});

afterEach(cleanup);

describe("mast height selector (S9)", () => {
  it("mast selector disabled with tooltip/message for non-catalog sites", () => {
    useAppStore.setState({
      scenarios: [{ key: "a", site: { kind: "custom", lat: -89.5, lon: 10 }, t0Ms: T0 }],
    });

    render(<SettingsPanel isOpen onOpenChange={() => {}} />);

    const group = screen.getByRole("radiogroup", { name: /mast height/i });
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(MAST_DISABLED_MESSAGE)).toBeTruthy();

    const radio50 = within(group).getByRole("radio", { name: "50 m" });
    expect(radio50.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(radio50);
    expect(useAppStore.getState().settings.mastM).toBe(2);
  });

  it("changing mast changes provenance text and re-evaluates", async () => {
    const api = createEngineHandlers(nodeFetchers);
    await api.init();

    const { rerender } = render(
      <>
        <SettingsPanel isOpen onOpenChange={() => {}} />
        <Provenance ctx={{ source: { kind: "site", id: "connecting-ridge", mastM: 2 } }} />
      </>,
    );

    const group = screen.getByRole("radiogroup", { name: /mast height/i });
    expect(group.getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByText("Horizon: LOLA site profile (mast 2 m) \u00b7 Ephemeris: DE440")).toBeTruthy();

    const r2 = await api.evaluate({
      ref: { kind: "catalog", id: "connecting-ridge" },
      t0Ms: T0,
      settings: useAppStore.getState().settings,
    });
    expect(r2.ctx.source).toEqual({ kind: "site", id: "connecting-ridge", mastM: 2 });

    const radio50 = within(group).getByRole("radio", { name: "50 m" });
    fireEvent.click(radio50);
    expect(useAppStore.getState().settings.mastM).toBe(50);

    const r50 = await api.evaluate({
      ref: { kind: "catalog", id: "connecting-ridge" },
      t0Ms: T0,
      settings: useAppStore.getState().settings,
    });
    expect(r50.ctx.source).toEqual({ kind: "site", id: "connecting-ridge", mastM: 50 });
    expect(r50.ctx.obsHeightM).toBe(50);
    expect(provenanceText(r50.ctx.source)).toBe("Horizon: LOLA site profile (mast 50 m) \u00b7 Ephemeris: DE440");

    // A 50 m mast sees further over local terrain than a 2 m mast.
    expect(r50.ctx.horizonDeg[0]).toBeLessThanOrEqual(r2.ctx.horizonDeg[0]);
    expect(r50.metrics.sunlitH).toBeGreaterThanOrEqual(r2.metrics.sunlitH);

    rerender(
      <>
        <SettingsPanel isOpen onOpenChange={() => {}} />
        <Provenance ctx={r50.ctx} />
      </>,
    );
    expect(screen.getByText("Horizon: LOLA site profile (mast 50 m) \u00b7 Ephemeris: DE440")).toBeTruthy();
  });
});
