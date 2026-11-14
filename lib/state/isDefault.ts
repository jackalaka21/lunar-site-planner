import { DEFAULT_SCENARIOS } from "./defaults";
import { DEFAULT_SETTINGS, type Settings } from "../engine/settings";
import type { Scenario } from "./url";

/** True when the view is exactly the default one: the default scenario alone, default settings, cursor at landing. */
export function isDefaultState(s: {
  scenarios: Scenario[];
  settings: Settings;
  cursorH: number;
}): boolean {
  if (s.cursorH !== 0 || s.scenarios.length !== DEFAULT_SCENARIOS.length) return false;
  const same = s.scenarios.every((sc, i) => {
    const d = DEFAULT_SCENARIOS[i];
    return (
      sc.key === d.key && sc.t0Ms === d.t0Ms && JSON.stringify(sc.site) === JSON.stringify(d.site)
    );
  });
  if (!same) return false;
  return (Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>).every(
    (k) => JSON.stringify(s.settings[k]) === JSON.stringify(DEFAULT_SETTINGS[k]),
  );
}
