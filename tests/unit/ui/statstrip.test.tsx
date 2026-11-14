// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatStrip } from "../../../components/shell/StatStrip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StatStrip", () => {
  it("closes when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<StatStrip />);
    expect(screen.getByTestId("stat-strip")).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    });
    expect(screen.queryByTestId("stat-strip")).toBeNull();
  });
});
