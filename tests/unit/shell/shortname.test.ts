import { describe, expect, it } from "vitest";
import { shortName } from "../../../components/shell/LeftPanel";

describe("shortName", () => {
  it("drops a leading group prefix", () => {
    expect(shortName("Artemis crewed landing candidate: Mons Mouton")).toBe("Mons Mouton");
  });
  it("leaves names without a prefix alone", () => {
    expect(shortName("Apollo 11 Eagle")).toBe("Apollo 11 Eagle");
  });
});
