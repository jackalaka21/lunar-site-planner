import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SCENARIOS, MAX_SCENARIOS } from "../../../lib/state/defaults";
import { bindUrlSync, createAppStore } from "../../../lib/state/store";
import { encodeState } from "../../../lib/state/url";

let store: ReturnType<typeof createAppStore>;
beforeEach(() => {
  store = createAppStore();
});

describe("store", () => {
  it("starts from the defaults", () => {
    expect(store.getState().scenarios).toEqual(DEFAULT_SCENARIOS);
    expect(store.getState().cursorH).toBe(0);
  });

  it("addScenario respects MAX_SCENARIOS and assigns unique keys", () => {
    for (let i = 0; i < 10; i++) store.getState().addScenario();
    const sc = store.getState().scenarios;
    expect(sc).toHaveLength(MAX_SCENARIOS);
    expect(new Set(sc.map((s) => s.key)).size).toBe(MAX_SCENARIOS);
  });

  it("addScenario accepts a partial scenario", () => {
    store.getState().addScenario({ site: { kind: "catalog", id: "apollo-11" } });
    expect(store.getState().scenarios[1].site).toEqual({ kind: "catalog", id: "apollo-11" });
  });

  it("removeScenario never leaves zero scenarios", () => {
    store.getState().addScenario();
    for (const s of [...store.getState().scenarios]) store.getState().removeScenario(s.key);
    expect(store.getState().scenarios).toHaveLength(1);
  });

  it("updateScenario patches by key but never changes the key", () => {
    const key = store.getState().scenarios[0].key;
    store.getState().updateScenario(key, { t0Ms: 5, key: "zzz" });
    expect(store.getState().scenarios[0]).toMatchObject({ key, t0Ms: 5 });
  });

  it("setSettings merges; setCursorH clamps at 0; speed/play set", () => {
    store.getState().setSettings({ durationDays: 20 });
    expect(store.getState().settings.durationDays).toBe(20);
    expect(store.getState().settings.batteryH).toBe(24);
    store.getState().setCursorH(-4);
    expect(store.getState().cursorH).toBe(0);
    store.getState().setPlaying(true);
    store.getState().setSpeed(6);
    expect(store.getState().playing).toBe(true);
    expect(store.getState().speedHps).toBe(6);
  });

  it("dismissNotice removes by index", () => {
    store.setState({ notices: ["a", "b"] });
    store.getState().dismissNotice(0);
    expect(store.getState().notices).toEqual(["b"]);
  });
});

describe("bindUrlSync", () => {
  it("hydrates from the URL and debounces replaceState by 250 ms", () => {
    vi.useFakeTimers();
    const replaceState = vi.fn();
    const stub = { search: "?dur=20&lit=foo", pathname: "/", hash: "", replaceState };
    const unbind = bindUrlSync(store, { location: stub, history: stub, knownSiteIds: null });
    expect(store.getState().settings.durationDays).toBe(20);
    expect(store.getState().notices.length).toBe(1);

    store.getState().setCursorH(1);
    store.getState().setCursorH(2);
    vi.advanceTimersByTime(249);
    expect(replaceState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
    const { scenarios, settings, cursorH } = store.getState();
    expect(replaceState.mock.calls[0][2]).toBe(`/?${encodeState({ scenarios, settings, cursorH })}`);

    store.getState().setPlaying(true); // not URL state
    vi.advanceTimersByTime(1000);
    expect(replaceState).toHaveBeenCalledTimes(1);

    store.getState().setCursorH(3);
    unbind();
    vi.advanceTimersByTime(1000);
    expect(replaceState).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
