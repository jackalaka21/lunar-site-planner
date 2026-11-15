import { resolveThemeTokens } from "@astryxdesign/core/theme";
import { ridgelineTheme } from "../../theme/ridgeline.theme";
import { panoramaPalette, type Palette, type PanoramaMode } from "../panorama/palette";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface TerrainPalette extends Palette {
  psr: Rgba;
  contour: Rgba;
  hazard: Rgba;
  textPrimary: Rgba;
}

/** Parse hex (3, 4, 6 or 8 digits) or rgb()/rgba() into 0-255 channels and 0-1 alpha. */
export function parseColor(input: string, fallback: Rgba = { r: 128, g: 128, b: 128, a: 1 }): Rgba {
  const c = input.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
    if (h.length !== 6 && h.length !== 8) return fallback;
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) / 255 : 1 };
  }
  const bare = /^([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?$/.exec(c);
  if (bare) return { r: Number(bare[1]), g: Number(bare[2]), b: Number(bare[3]), a: bare[4] === undefined ? 1 : Number(bare[4]) };
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(c);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) } : fallback;
}

function tokenValue(name: string, mode: PanoramaMode): string {
  const t = resolveThemeTokens(ridgelineTheme, { mode }) as Record<string, string>;
  const local = ridgelineTheme.localTokens as Record<string, [string, string] | string> | undefined;
  const pair = local?.[name];
  if (Array.isArray(pair)) return pair[mode === "light" ? 0 : 1];
  const raw = (typeof pair === "string" ? pair : undefined) ?? t[name] ?? "";
  const m = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/i.exec(raw);
  return m ? m[mode === "light" ? 1 : 2] : raw;
}

/** Panorama palette plus the terrain overlay tokens, all resolved from the theme. */
export function terrainPalette(mode: PanoramaMode): TerrainPalette {
  const base = panoramaPalette(mode);
  const rim = parseColor(base.rim);
  return {
    ...base,
    psr: parseColor(tokenValue("--color-terrain-psr", mode), rim),
    contour: parseColor(tokenValue("--color-terrain-contour", mode), { ...rim, a: 0.4 }),
    hazard: parseColor(tokenValue("--color-terrain-hazard", mode), rim),
    textPrimary: parseColor(tokenValue("--color-text-primary", mode), rim),
  };
}
