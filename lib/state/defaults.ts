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
    // The plain mons-mouton point is never Good at default settings (84.3 S, 2 m mast), so the demo uses the
    // Mons Mouton-area Artemis III site. First Good landing from 2027-01-01 (npx tsx scripts/pick-default-date.ts):
    // 2027-01-14 06:00 UTC, Good, 317 h sun and Earth, 94% lit, no dark spell.
    site: { kind: "catalog", id: "artemis3-mons-mouton" },
    t0Ms: Date.UTC(2027, 0, 14, 6, 0),
  },
];
