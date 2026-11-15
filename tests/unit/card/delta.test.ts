import { describe, expect, it } from "vitest";
import { formatSpan } from "../../../components/card/delta";

const MIN = 60_000;
const H = 3_600_000;

describe("formatSpan", () => {
  it("shows minutes under an hour, never 0 h", () => {
    expect(formatSpan(35 * MIN)).toBe("35 min");
    expect(formatSpan(59 * MIN + 59_000)).toBe("59 min");
    expect(formatSpan(30_000)).toBe("< 1 min");
    expect(formatSpan(0)).toBe("< 1 min");
    expect(formatSpan(-5)).toBe("< 1 min");
  });
  it("keeps whole hours and days from one hour up", () => {
    expect(formatSpan(H)).toBe("1 h");
    expect(formatSpan(25 * H)).toBe("1 d 1 h");
  });
});
