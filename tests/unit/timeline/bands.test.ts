import { describe, expect, it } from "vitest";
import { runs } from "../../../components/timeline/bands";

describe("runs", () => {
  it("merges contiguous", () => {
    expect(runs(Uint8Array.from([1, 1, 0, 0, 0, 1]))).toEqual([
      { start: 0, end: 2, value: 1 },
      { start: 2, end: 5, value: 0 },
      { start: 5, end: 6, value: 1 },
    ]);
  });
  it("is empty for empty input", () => {
    expect(runs(new Uint8Array(0))).toEqual([]);
  });
});
