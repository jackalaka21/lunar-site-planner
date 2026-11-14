import { roundHalfEven } from "../../lib/engine/format";

const MINUS = "−";

/** "−96 h vs A", "+12 h vs A" or "same as A" for a difference in hours against scenario A. */
export function formatDelta(deltaH: number): string {
  const r = roundHalfEven(deltaH);
  if (r === 0) return "same as A";
  return `${r < 0 ? MINUS : "+"}${Math.abs(r)} h vs A`;
}

/** A span in milliseconds as "3 d 4 h", or "4 h" under a day. Whole hours, floored. */
export function formatSpan(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 3_600_000);
  const d = Math.floor(total / 24);
  const h = total % 24;
  return d > 0 ? `${d} d ${h} h` : `${h} h`;
}
