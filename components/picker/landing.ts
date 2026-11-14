import { MAX_T0_MS, MIN_T0_MS } from "../../lib/state/defaults";

export const LANDING_COVERAGE = "Ephemeris covers 1969–2035";
const DATE_ERROR = "Use YYYY-MM-DD";
const TIME_ERROR = "Use HH:MM, 24 hour";

export type LandingParse = { ok: true; t0Ms: number } | { ok: false; field: "date" | "time"; error: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** Landing instant from a UTC date (YYYY-MM-DD) and time (HH:MM). Range errors sit on the date field. */
export function parseLanding(dateText: string, timeText: string): LandingParse {
  const d = DATE_RE.exec(dateText.trim());
  const day = d ? Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : NaN;
  const real = d !== null && Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === dateText.trim();
  if (!real) return { ok: false, field: "date", error: DATE_ERROR };
  const t = TIME_RE.exec(timeText.trim());
  if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return { ok: false, field: "time", error: TIME_ERROR };
  const t0Ms = day + (Number(t[1]) * 60 + Number(t[2])) * 60_000;
  if (t0Ms < MIN_T0_MS || t0Ms > MAX_T0_MS) return { ok: false, field: "date", error: LANDING_COVERAGE };
  return { ok: true, t0Ms };
}

export const landingDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const landingTime = (ms: number) => new Date(ms).toISOString().slice(11, 16);
