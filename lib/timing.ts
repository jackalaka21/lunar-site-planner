export interface LspTiming {
  /** Milliseconds from calling engine.evaluate to receiving the result, one entry per call. */
  evaluate: number[];
  last: number;
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
export function recordEvaluateTiming(ms: number): void {
  if (typeof window === "undefined") return;
  if (enabled === null) {
    enabled = process.env.NODE_ENV !== "production" || new URLSearchParams(window.location.search).has("timing");
  }
  if (!enabled) return;
  const t = (window.__lspTiming ??= { evaluate: [], last: 0 });
  t.evaluate.push(ms);
  t.last = ms;
}
