// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { downloadComparisonPng, exportElementToPngBlob } from "../../lib/exportPng";

describe("exportPng", () => {
  it("exportElementToPngBlob produces a blob of type image/png", async () => {
    const el = document.createElement("section");
    el.textContent = "Scenario Comparison Summary";
    document.body.appendChild(el);
    try {
      const blob = await exportElementToPngBlob(el);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(0);
    } finally {
      el.remove();
    }
  });

  it("downloadComparisonPng returns a blob of type image/png", async () => {
    const el = document.createElement("section");
    el.textContent = "Scenario Comparison Table";
    document.body.appendChild(el);
    try {
      const blob = await downloadComparisonPng(el, "comparison.png");
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(0);
    } finally {
      el.remove();
    }
  });
});
