// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsPanel } from "../../../components/settings/SettingsPanel";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { useAppStore } from "../../../lib/state/store";

beforeEach(() => {
  // jsdom has no <dialog> modal API; the Drawer needs it to open.
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.show = proto.showModal;
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel } } });
});
afterEach(cleanup);

function commit(label: RegExp, value: string) {
  const input = screen.getByLabelText(label, { selector: "input" }) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe("SettingsPanel", () => {
  it("clamps durationDays input 0 → 1 and 99 → 30", () => {
    render(<SettingsPanel isOpen onOpenChange={() => {}} />);
    commit(/mission length/i, "0");
    expect(useAppStore.getState().settings.durationDays).toBe(1);
    commit(/mission length/i, "99");
    expect(useAppStore.getState().settings.durationDays).toBe(30);
  });
});
