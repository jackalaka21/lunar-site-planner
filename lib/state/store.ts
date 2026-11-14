import { create, type StoreApi, type UseBoundStore } from "zustand";
import { DEFAULT_SETTINGS, type Settings } from "../engine/settings";
import { DEFAULT_SCENARIOS, MAX_SCENARIOS, SCENARIO_KEYS } from "./defaults";
import { decodeState, encodeState, type Scenario, type UrlState } from "./url";

export interface AppState extends UrlState {
  playing: boolean;
  speedHps: 1 | 6 | 24;
  notices: string[];
  addScenario(s?: Partial<Scenario>): void;
  updateScenario(key: string, patch: Partial<Scenario>): void;
  removeScenario(key: string): void;
  setSettings(p: Partial<Settings>): void;
  setCursorH(h: number): void;
  setPlaying(p: boolean): void;
  setSpeed(v: 1 | 6 | 24): void;
  dismissNotice(i: number): void;
}

function defaultScenarios(): Scenario[] {
  return DEFAULT_SCENARIOS.map((s) => ({ ...s, site: { ...s.site } }));
}

export function createAppStore(): UseBoundStore<StoreApi<AppState>> {
  return create<AppState>()((set) => ({
    scenarios: defaultScenarios(),
    settings: { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel } },
    cursorH: 0,
    playing: false,
    speedHps: 6,
    notices: [],

    addScenario: (s) =>
      set((st) => {
        if (st.scenarios.length >= MAX_SCENARIOS) return st;
        const key = SCENARIO_KEYS.find((k) => !st.scenarios.some((x) => x.key === k));
        if (!key) return st;
        const base = DEFAULT_SCENARIOS[0];
        const next: Scenario = { site: { ...base.site }, t0Ms: base.t0Ms, ...s, key };
        return { scenarios: [...st.scenarios, next] };
      }),
    updateScenario: (key, patch) =>
      set((st) => ({ scenarios: st.scenarios.map((x) => (x.key === key ? { ...x, ...patch, key } : x)) })),
    removeScenario: (key) =>
      set((st) => {
        if (st.scenarios.length <= 1) return st;
        return { scenarios: st.scenarios.filter((x) => x.key !== key) };
      }),
    setSettings: (p) =>
      set((st) => {
        const settings = { ...st.settings, ...p };
        return { settings, cursorH: Math.min(st.cursorH, settings.durationDays * 24) };
      }),
    setCursorH: (h) => set({ cursorH: Number.isFinite(h) ? Math.max(0, h) : 0 }),
    setPlaying: (playing) => set({ playing }),
    setSpeed: (speedHps) => set({ speedHps }),
    dismissNotice: (i) => set((st) => ({ notices: st.notices.filter((_, j) => j !== i) })),
  }));
}

export const useAppStore = createAppStore();

export interface UrlSyncOptions {
  location: { search: string; pathname: string; hash: string };
  history: { replaceState(data: unknown, unused: string, url: string): void };
  knownSiteIds: Set<string> | null;
  debounceMs?: number;
}

/**
 * Hydrate the store from the current URL, then mirror URL-state changes back with a debounced
 * history.replaceState. Returns an unsubscribe function that also cancels a pending write.
 * Call from a client component effect, e.g. bindUrlSync(useAppStore, { location, history, knownSiteIds }).
 */
export function bindUrlSync(store: StoreApi<AppState>, opts: UrlSyncOptions): () => void {
  const delay = opts.debounceMs ?? 250;
  const { state, notices } = decodeState(opts.location.search, opts.knownSiteIds);
  store.setState({ ...state, notices });

  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const { scenarios, settings, cursorH } = store.getState();
      const qs = encodeState({ scenarios, settings, cursorH });
      opts.history.replaceState(null, "", `${opts.location.pathname}?${qs}${opts.location.hash}`);
    }, delay);
  };

  // Rewrite a hand-edited or stale link into its canonical form.
  if (notices.length > 0) schedule();

  const unsubscribe = store.subscribe((next, prev) => {
    if (next.scenarios !== prev.scenarios || next.settings !== prev.settings || next.cursorH !== prev.cursorH) {
      schedule();
    }
  });
  return () => {
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
