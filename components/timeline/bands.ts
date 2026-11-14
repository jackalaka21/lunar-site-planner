export interface Run {
  /** First index of the run. */
  start: number;
  /** Index one past the last sample of the run. */
  end: number;
  value: 0 | 1;
}

/** Contiguous runs of equal value, in order. Any non-zero sample counts as 1. */
export function runs(state: Uint8Array): Run[] {
  const out: Run[] = [];
  let start = 0;
  for (let i = 1; i <= state.length; i++) {
    if (i === state.length || (state[i] ? 1 : 0) !== (state[start] ? 1 : 0)) {
      if (i > start) out.push({ start, end: i, value: state[start] ? 1 : 0 });
      start = i;
    }
  }
  return out;
}

/** The longest run of the given value, or null when there is none. */
export function longestRun(state: Uint8Array, value: 0 | 1): Run | null {
  let best: Run | null = null;
  for (const r of runs(state)) {
    if (r.value === value && (best === null || r.end - r.start > best.end - best.start)) best = r;
  }
  return best;
}

/** Runs where the value is above zero, from a float series. */
export function positiveRuns(values: Float32Array | Float64Array): Run[] {
  const bits = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) bits[i] = values[i] > 0 ? 1 : 0;
  return runs(bits).filter((r) => r.value === 1);
}
