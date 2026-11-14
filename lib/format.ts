const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const MINUS = "\u2212";

/**
 * Mission-elapsed time as "T+3 d 04 h", or "T−0 d 02 h" before landing.
 * `ms` is the offset from landing in milliseconds. Whole hours, truncated toward the landing instant.
 */
export function formatMet(ms: number): string {
  const totalHours = Math.trunc((Number.isFinite(ms) ? ms : 0) / MS_PER_HOUR);
  const sign = totalHours < 0 || Object.is(totalHours, -0) ? MINUS : "+";
  const abs = Math.abs(totalHours);
  const days = Math.floor(abs / HOURS_PER_DAY);
  const hours = abs % HOURS_PER_DAY;
  return `T${sign}${days} d ${String(hours).padStart(2, "0")} h`;
}
