// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayback, useTimeKeyboard } from "../../../components/time/usePlayback";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { useAppStore } from "../../../lib/state/store";

let now = 0;
let nextId = 1;
let queue = new Map<number, FrameRequestCallback>();

/** Runs one animation frame, `ms` after the previous one. */
function frame(ms: number) {
  now += ms;
  const pending = [...queue.entries()];
  queue = new Map();
  act(() => {
    for (const [, cb] of pending) cb(now);
  });
}

function Combined() {
  usePlayback();
  useTimeKeyboard();
}

beforeEach(() => {
  now = 0;
  nextId = 1;
  queue = new Map();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue.delete(id);
  });
  useAppStore.setState({
    cursorH: 0,
    playing: false,
    speedHps: 6,
    settings: { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel }, durationDays: 14 },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("usePlayback", () => {
  it("advances 6h per second at speed 6", () => {
    renderHook(() => usePlayback());
    act(() => useAppStore.getState().setPlaying(true));
    frame(0);
    frame(1000);
    expect(useAppStore.getState().cursorH).toBeCloseTo(6, 6);
    frame(500);
    expect(useAppStore.getState().cursorH).toBeCloseTo(9, 6);
  });

  it("stops at duration end", () => {
    useAppStore.setState({ cursorH: 330, speedHps: 24 });
    renderHook(() => usePlayback());
    act(() => useAppStore.getState().setPlaying(true));
    frame(0);
    frame(5000);
    const s = useAppStore.getState();
    expect(s.cursorH).toBe(14 * 24);
    expect(s.playing).toBe(false);
  });

  it("pauses the clock while the document is hidden", () => {
    renderHook(() => usePlayback());
    act(() => useAppStore.getState().setPlaying(true));
    frame(0);
    frame(1000);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(queue.size).toBe(0);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    frame(60_000); // first frame after returning only sets the baseline
    frame(1000);
    expect(useAppStore.getState().cursorH).toBeCloseTo(12, 6);
  });
});

describe("useTimeKeyboard", () => {
  it("keyboard shift+right adds 24h", () => {
    renderHook(() => Combined());
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }));
    });
    expect(useAppStore.getState().cursorH).toBe(24);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(useAppStore.getState().cursorH).toBe(23);
  });

  it("space toggles play", () => {
    renderHook(() => Combined());
    const press = () =>
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      });
    press();
    expect(useAppStore.getState().playing).toBe(true);
    press();
    expect(useAppStore.getState().playing).toBe(false);
  });

  it("ignores keys typed into an input", () => {
    renderHook(() => Combined());
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(useAppStore.getState().playing).toBe(false);
    expect(useAppStore.getState().cursorH).toBe(0);
    input.remove();
  });
});
