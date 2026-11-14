import { describe, expect, it } from "vitest";
import { resolveThemeTokens } from "@astryxdesign/core/theme";
import { ridgelineTheme } from "../../../theme/ridgeline.theme";

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum(hex: string): number {
  const [r, g, b] = parse(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(["light", "dark"] as const)("contrast, %s mode", (mode) => {
  const t = resolveThemeTokens(ridgelineTheme, { mode });
  // Local tokens (muted text) are not part of the Astryx token map; read their [light, dark] pair.
  const localPairs = ridgelineTheme.localTokens as Record<string, [string, string] | string> | undefined;
  const local = (name: string): string => {
    const pair = localPairs?.[name];
    if (Array.isArray(pair)) return pair[mode === "light" ? 0 : 1];
    const raw = (typeof pair === "string" ? pair : undefined) ?? t[name];
    const m = /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(raw ?? "");
    return m ? m[mode === "light" ? 1 : 2] : raw;
  };
  const page = t["--color-background-body"];
  const card = t["--color-background-card"];
  const rows: [string, string, string, number][] = [];
  for (const [role, key] of [
    ["primary", "--color-text-primary"],
    ["secondary", "--color-text-secondary"],
    ["muted", "--color-text-muted"],
  ] as const) {
    rows.push([`${role} on page`, local(key), page, 4.5]);
    rows.push([`${role} on card`, local(key), card, 4.5]);
  }
  for (const [name, key] of [
    ["Sun", "--color-data-categorical-orange"],
    ["Earth", "--color-data-categorical-blue"],
    ["Both ink", "--color-text-primary"],
    ["success mark", "--color-icon-success"],
    ["error mark", "--color-icon-error"],
    ["neutral mark", "--color-data-neutral"],
  ] as const) {
    rows.push([`${name} on card`, local(key), card, 3]);
  }
  rows.push(["primary button text", local("--color-on-accent"), local("--color-accent"), 4.5]);

  it("resolves hex values for every checked token", () => {
    for (const [, fg, bg] of rows) {
      expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(rows)("%s", (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
