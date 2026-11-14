export interface LspTiming {
  /** Milliseconds from calling engine.evaluate to receiving the result, one entry per call. */
  evaluate: number[];
  last: number;
  /** Milliseconds for each landing-calendar compute (engine.calendar + subsolar), per open. */
  calendar: number[];
}

declare global {
  interface Window {
    __lspTiming?: LspTiming;
  }
}

let enabled: boolean | null = null;

/**
 * Test hook for the 150 ms recompute budget. window.__lspTiming is exposed only outside production builds,
 * or in any build when the page was opened with ?timing=1 (decided once, at the first call).
 */
function hook(): LspTiming | null {
  if (typeof window === "undefined") return null;
  if (enabled === null) {
    enabled = process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("timing");
  }
  if (!enabled) return null;
  const t = (window.__lspTiming ??= { evaluate: [], last: 0, calendar: [] });
  t.calendar ??= [];
  return t;
}

export function recordEvaluateTiming(ms: number): void {
  const t = hook();
  if (!t) return;
  t.evaluate.push(ms);
  t.last = ms;
}

/** Same hook for the 1.5 s landing-calendar budget. */
export function recordCalendarTiming(ms: number): void {
  hook()?.calendar.push(ms);
}
