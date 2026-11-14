/** Number formatting for engine reason strings. Mirrors the Python oracle (round-half-even, %g). */

/** Round half to even, like Python round() and the .0f format on exact ties. */
export function roundHalfEven(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** General format with up to 6 significant digits and no trailing zeros (Python :g). */
export function fmtG(x: number): string {
  return String(Number(x.toPrecision(6)));
}

/** Whole hours, e.g. "127 h". */
export function fmtHours(h: number): string {
  return `${roundHalfEven(h)} h`;
}

/** Whole days elapsed (floor), e.g. "9 d". */
export function fmtDays(d: number): string {
  return `${Math.floor(d)} d`;
}

/** Whole percent, e.g. "37%". */
export function fmtPct(p: number): string {
  return `${roundHalfEven(p)}%`;
}
