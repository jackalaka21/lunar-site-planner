// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Term } from "../../../components/ui/Term";
import { GLOSSARY, type GlossaryId } from "../../../lib/glossary";

afterEach(cleanup);

describe("Term", () => {
  it("shows tooltip on focus and has aria-describedby", async () => {
    render(<Term id="elevation">elevation</Term>);
    const trigger = screen.getByRole("button", { name: /elevation/i });
    expect(trigger.getAttribute("aria-describedby")).toBeTruthy();
    act(() => trigger.focus());
    const tip = await screen.findByRole("tooltip", {}, { timeout: 2000 });
    expect(tip.textContent).toContain(GLOSSARY.elevation.text);
  });
});

describe("glossary", () => {
  it("every GlossaryId has non-empty text", () => {
    const ids = Object.keys(GLOSSARY) as GlossaryId[];
    expect(ids.length).toBeGreaterThanOrEqual(22);
    for (const id of ids) {
      expect(GLOSSARY[id].term.trim().length).toBeGreaterThan(0);
      expect(GLOSSARY[id].text.trim().length).toBeGreaterThan(0);
    }
    for (const required of [
      "elevation", "azimuth", "horizon", "terrainHorizon", "earthset", "earthrise", "sunset", "dte",
      "libration", "eclipse", "solarInterference", "visibleFraction", "powerProxy", "met", "verdict",
      "batteryReserve", "flicker", "dsn", "landingEllipse", "psr", "subSolarLatitude", "verticalExaggeration",
    ]) {
      expect(ids).toContain(required);
    }
  });
});

void waitFor;
