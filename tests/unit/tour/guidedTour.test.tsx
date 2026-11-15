// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuidedTour } from "../../../components/tour/GuidedTour";
import { TOUR_STEPS } from "../../../components/tour/tourSteps";

beforeEach(() => {
  // jsdom has no layout: give every element a size so a target counts as on screen.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ left: 10, top: 10, width: 100, height: 40, right: 110, bottom: 50, x: 10, y: 10, toJSON: () => ({}) }) as DOMRect,
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GuidedTour", () => {
  it("names the dialog after the step title and advances with Next and ArrowRight", () => {
    render(<GuidedTour onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: TOUR_STEPS[0].title });
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("dialog", { name: TOUR_STEPS[1].title })).toBeTruthy();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByRole("dialog", { name: TOUR_STEPS[2].title })).toBeTruthy();
    expect(screen.getByText("Step 3 of 10")).toBeTruthy();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<GuidedTour onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener when it unmounts", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(<GuidedTour onClose={() => {}} />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("shows one full pane and no ring when the target is missing", async () => {
    render(<GuidedTour onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // topbar step, no such element in the DOM
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByTestId("tour-ring")).toBeNull();
    expect(screen.getAllByTestId("tour-pane")).toHaveLength(1);
  });

  it("draws a ring and four panes when the target exists", async () => {
    const el = document.createElement("div");
    el.setAttribute("data-tour-id", "tour-topbar");
    document.body.appendChild(el);
    render(<GuidedTour onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId("tour-ring")).toBeTruthy();
    expect(screen.getAllByTestId("tour-pane")).toHaveLength(4);
    el.remove();
  });

  it("uses the exact Sun elevation copy in step 1", () => {
    render(<GuidedTour onClose={() => {}} />);
    expect(screen.getByText(/about 1\.5° at the pole, up to about 7° at Mons Mouton/)).toBeTruthy();
  });
});
