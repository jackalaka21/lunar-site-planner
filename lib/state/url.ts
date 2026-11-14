import { DEFAULT_SETTINGS, SETTINGS_RANGES, type Settings } from "../engine/settings";
import { DEFAULT_SCENARIOS, MAX_SCENARIOS, MAX_T0_MS, MIN_T0_MS, SCENARIO_KEYS } from "./defaults";

export type SiteRef = { kind: "catalog"; id: string } | { kind: "custom"; lat: number; lon: number };
export interface Scenario {
  key: string;
  site: SiteRef;
  t0Ms: number;
}
export interface UrlState {
  scenarios: Scenario[];
  settings: Settings;
  cursorH: number;
}

export { DEFAULT_SCENARIOS, MAX_SCENARIOS };

/** Wrap a longitude into [-180, 180). */
export function normaliseLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

type NumericKey = keyof typeof SETTINGS_RANGES;
const NUMERIC_PARAMS: ReadonlyArray<readonly [string, NumericKey]> = [
  ["dur", "durationDays"],
  ["em", "earthMarginDeg"],
  ["bat", "batteryH"],
  ["fm", "flickerMergeMin"],
  ["int", "interferenceDeg"],
];
const NUMERIC_PARAMS_LATE: ReadonlyArray<readonly [string, NumericKey]> = [
  ["dm", "dsnMaskDeg"],
  ["hu", "horizonUncertDeg"],
  ["el", "ellipseKm"],
];
const LIT_CODE = { any: "any", half: "50", full: "100" } as const;
const LIT_FROM_CODE: Record<string, Settings["litThreshold"]> = { any: "any", "50": "half", "100": "full" };

const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/;
const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16) + "Z";
}

function validTimeZone(tz: string): boolean {
  if (tz === "UTC") return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function fmt3(n: number): string {
  return n.toFixed(3);
}

function encodeSite(site: SiteRef): string {
  return site.kind === "catalog" ? site.id : `c:${fmt3(site.lat)},${fmt3(normaliseLon(site.lon))}`;
}

/** Query string without the leading '?'. Only non-default settings are written. */
export function encodeState(s: UrlState): string {
  const parts: string[] = ["v=1"];
  parts.push("sc=" + s.scenarios.map((sc) => `${encodeSite(sc.site)}@${isoOf(sc.t0Ms)}`).join(";"));
  const d = DEFAULT_SETTINGS;
  const st = s.settings;
  const num = (param: string, key: NumericKey) => {
    if (st[key] !== d[key]) parts.push(`${param}=${st[key]}`);
  };
  for (const [p, k] of NUMERIC_PARAMS.slice(0, 1)) num(p, k);
  if (st.litThreshold !== d.litThreshold) parts.push(`lit=${LIT_CODE[st.litThreshold]}`);
  for (const [p, k] of NUMERIC_PARAMS.slice(1)) num(p, k);
  if (st.dsnEnabled !== d.dsnEnabled) parts.push(`dsn=${st.dsnEnabled ? 1 : 0}`);
  for (const [p, k] of NUMERIC_PARAMS_LATE) num(p, k);
  if (st.mastM !== d.mastM) parts.push(`mast=${st.mastM}`);
  if (st.panel.mode === "fixed") parts.push(`pan=${st.panel.azDeg}`);
  if (st.axis !== d.axis) parts.push(`axis=${st.axis}`);
  if (st.displayTz !== d.displayTz) parts.push(`tz=${encodeURIComponent(st.displayTz)}`);
  parts.push(`t=${s.cursorH}`);
  return parts.join("&");
}

function cloneDefaults(): Scenario[] {
  return DEFAULT_SCENARIOS.map((sc) => ({ ...sc, site: { ...sc.site } }));
}

/**
 * Decode a query string into a valid state. Never throws and never returns an empty scenario
 * list: bad input falls back to defaults and adds a human-readable notice.
 */
export function decodeState(
  qs: string,
  knownSiteIds: Set<string> | null,
): { state: UrlState; notices: string[] } {
  const notices: string[] = [];
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  } catch {
    params = new URLSearchParams();
  }

  const v = params.get("v");
  if (v !== null && v !== "1") notices.push(`Unsupported link version "${v}"; read as version 1`);

  // ---- scenarios
  const defaultT0 = DEFAULT_SCENARIOS[0].t0Ms;
  let scenarios: Scenario[] = [];
  const scRaw = params.get("sc");
  if (scRaw !== null && scRaw !== "") {
    let segments = scRaw.split(";").filter((x) => x !== "");
    if (segments.length > MAX_SCENARIOS) {
      notices.push(`Only ${MAX_SCENARIOS} scenarios are supported; extra scenarios were dropped`);
      segments = segments.slice(0, MAX_SCENARIOS);
    }
    for (const seg of segments) {
      const at = seg.lastIndexOf("@");
      const siteStr = at === -1 ? seg : seg.slice(0, at);
      const dateStr = at === -1 ? null : seg.slice(at + 1);

      let site: SiteRef | null = null;
      if (siteStr.startsWith("c:")) {
        const [latS, lonS, ...rest] = siteStr.slice(2).split(",");
        if (rest.length === 0 && latS !== undefined && lonS !== undefined && NUMBER_RE.test(latS) && NUMBER_RE.test(lonS)) {
          const lat = Number(latS);
          if (lat < -90 || lat > 90) {
            notices.push(`Latitude out of range in "${siteStr}"; scenario dropped`);
          } else {
            const lon = normaliseLon(Math.round(Number(lonS) * 1000) / 1000);
            site = {
              kind: "custom",
              lat: Math.round(lat * 1000) / 1000 + 0,
              lon: Math.round(lon * 1000) / 1000 + 0,
            };
          }
        } else {
          notices.push(`Could not read the coordinates "${siteStr}"; scenario dropped`);
        }
      } else if (ID_RE.test(siteStr) && (knownSiteIds === null || knownSiteIds.has(siteStr))) {
        site = { kind: "catalog", id: siteStr };
      } else {
        notices.push(`Unknown site "${siteStr.slice(0, 40)}"; scenario dropped`);
      }
      if (!site) continue;

      let t0Ms = defaultT0;
      if (dateStr !== null) {
        const ms = ISO_RE.test(dateStr) ? Date.parse(dateStr) : NaN;
        if (!Number.isFinite(ms) || isoOf(ms) !== dateStr) {
          notices.push(`Invalid date "${dateStr.slice(0, 24)}"; used the default date`);
        } else if (ms < MIN_T0_MS || ms > MAX_T0_MS) {
          notices.push(`Date "${dateStr}" is outside 1969 to 2035; used the default date`);
        } else {
          t0Ms = ms;
        }
      }
      scenarios.push({ key: SCENARIO_KEYS[scenarios.length], site, t0Ms });
    }
    if (scenarios.length === 0 && segments.length === 0) notices.push("No scenarios found; used the default");
  }
  if (scenarios.length === 0) scenarios = cloneDefaults();

  // ---- settings
  const settings: Settings = { ...DEFAULT_SETTINGS, panel: { ...DEFAULT_SETTINGS.panel } };

  const readNumber = (param: string, key: NumericKey) => {
    const raw = params.get(param);
    if (raw === null) return;
    if (!NUMBER_RE.test(raw)) {
      notices.push(`Invalid ${param}="${raw.slice(0, 20)}"; used the default`);
      return;
    }
    const { min, max } = SETTINGS_RANGES[key];
    const n = Number(raw);
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== n) notices.push(`${param}=${raw} is outside ${min} to ${max}; clamped to ${clamped}`);
    settings[key] = clamped;
  };
  for (const [p, k] of NUMERIC_PARAMS) readNumber(p, k);
  for (const [p, k] of NUMERIC_PARAMS_LATE) readNumber(p, k);

  const lit = params.get("lit");
  if (lit !== null) {
    if (Object.prototype.hasOwnProperty.call(LIT_FROM_CODE, lit)) settings.litThreshold = LIT_FROM_CODE[lit];
    else notices.push(`Invalid lit="${lit.slice(0, 20)}"; used the default`);
  }
  const dsn = params.get("dsn");
  if (dsn !== null) {
    if (dsn === "0" || dsn === "1") settings.dsnEnabled = dsn === "1";
    else notices.push(`Invalid dsn="${dsn.slice(0, 20)}"; used the default`);
  }
  const mast = params.get("mast");
  if (mast !== null) {
    if (mast === "2" || mast === "10" || mast === "50") settings.mastM = Number(mast) as 2 | 10 | 50;
    else notices.push(`Invalid mast="${mast.slice(0, 20)}"; used the default`);
  }
  const pan = params.get("pan");
  if (pan !== null) {
    if (pan === "t") {
      settings.panel = { mode: "tracking" };
    } else if (NUMBER_RE.test(pan)) {
      settings.panel = { mode: "fixed", azDeg: ((Number(pan) % 360) + 360) % 360 };
    } else {
      notices.push(`Invalid pan="${pan.slice(0, 20)}"; used the default`);
    }
  }
  const axis = params.get("axis");
  if (axis !== null) {
    if (axis === "met" || axis === "cal") settings.axis = axis;
    else notices.push(`Invalid axis="${axis.slice(0, 20)}"; used the default`);
  }
  const tz = params.get("tz");
  if (tz !== null) {
    if (validTimeZone(tz)) settings.displayTz = tz;
    else notices.push(`Unknown time zone "${tz.slice(0, 40)}"; used UTC`);
  }

  // ---- cursor
  let cursorH = 0;
  const t = params.get("t");
  if (t !== null) {
    if (!NUMBER_RE.test(t)) {
      notices.push(`Invalid t="${t.slice(0, 20)}"; used 0`);
    } else {
      const max = settings.durationDays * 24;
      const n = Number(t);
      cursorH = Math.min(max, Math.max(0, n));
      if (cursorH !== n) notices.push(`t=${t} is outside 0 to ${max} h; clamped to ${cursorH}`);
    }
  }

  return { state: { scenarios, settings, cursorH }, notices };
}
