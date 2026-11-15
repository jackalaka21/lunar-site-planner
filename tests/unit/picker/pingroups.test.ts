import { describe, expect, it } from "vitest";
import { groupPins } from "../../../components/picker/MapPicker";

const at = (key: string, index: number, x: number, y: number) => ({ key, index, p: { x, y } });

describe("groupPins", () => {
  it("merges pins on the same spot into one labelled pin and drags the active scenario", () => {
    const g = groupPins([at("a", 0, 100, 100), at("b", 1, 100, 100)], 2, "b");
    expect(g).toHaveLength(1);
    expect(g[0].letters).toEqual(["A", "B"]);
    expect(g[0].dragKey).toBe("b");
    expect(g[0].width).toBeGreaterThan(28);
  });
  it("falls back to the first member when the active scenario is elsewhere", () => {
    const g = groupPins([at("a", 0, 10, 10), at("b", 1, 10, 11), at("c", 2, 200, 200)], 2, "c");
    expect(g.map((x) => x.keys)).toEqual([["a", "b"], ["c"]]);
    expect(g[0].dragKey).toBe("a");
    expect(g[1].width).toBe(28);
  });
  it("splits pins that are farther apart than the threshold", () => {
    expect(groupPins([at("a", 0, 0, 0), at("b", 1, 5, 0)], 2, "a")).toHaveLength(2);
  });
});
