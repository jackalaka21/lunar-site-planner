import type { Scenario } from "./url";

export const MAX_SCENARIOS = 4;

/** Scenario keys are positional so a decoded URL is deterministic. */
export const SCENARIO_KEYS = ["a", "b", "c", "d"] as const;

/** Supported landing-date range (Global Constraints): 1969-01-01T00:00Z to 2035-12-31T23:00Z. */
export const MIN_T0_MS = Date.UTC(1969, 0, 1);
export const MAX_T0_MS = Date.UTC(2035, 11, 31, 23);

export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    key: "a",
    site: { kind: "catalog", id: "mons-mouton" },
    // TODO(Task 19): replace with picked Good date
    t0Ms: Date.UTC(2027, 0, 1, 0, 0),
  },
];
