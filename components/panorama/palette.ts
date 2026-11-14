import { resolveThemeTokens } from "@astryxdesign/core/theme";
import { ridgelineTheme } from "../../theme/ridgeline.theme";

export type PanoramaMode = "light" | "dark";

export interface Palette {
  sun: string;
  earth: string;
  /** Sky: the page background. */
  sky: string;
  /** Far terrain step: the darker of the card and raised surfaces in this mode. */
  far: string;
  /** Near terrain step: the lighter of the card and raised surfaces in this mode. */
  near: string;
  /** Unlit part of Earth. */
  deepest: string;
  hairline: string;
  rim: string;
}

function channels(color: string): [number, number, number] {
  const c = color.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

/** Relative luminance (0..1) of a hex or rgb() colour. */
export function luminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear blend of two colours, as an rgb() string (t = 0 gives a, t = 1 gives b). */
function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Resolve every colour the canvas needs for one mode, from the theme and never from literals. */
export function panoramaPalette(mode: PanoramaMode): Palette {
  const t = resolveThemeTokens(ridgelineTheme, { mode }) as Record<string, string>;
  const local = ridgelineTheme.localTokens as Record<string, [string, string] | string> | undefined;
  const get = (name: string): string => {
    const pair = local?.[name];
    if (Array.isArray(pair)) return pair[mode === "light" ? 0 : 1];
    const raw = (typeof pair === "string" ? pair : undefined) ?? t[name] ?? "";
    const m = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/i.exec(raw);
    return m ? m[mode === "light" ? 1 : 2] : raw;
  };
  const card = get("--color-background-card");
  const raised = get("--surface-raised");
  const cardLighter = luminance(card) > luminance(raised);
  if (mode === "light") {
    // The light surfaces are within a few percent of each other, so the terrain steps are taken further down
    // the graphite ramp (deepest surface toward the emphasised border). Dark mode keeps the plain surfaces.
    const deepest = get("--surface-deepest");
    const rim = get("--color-border-emphasized");
    return {
      sun: get("--color-data-categorical-orange"),
      earth: get("--color-data-categorical-blue"),
      sky: get("--color-background-body"),
      far: mix(deepest, rim, 0.25),
      near: deepest,
      deepest: mix(deepest, rim, 0.6),
      hairline: get("--color-border"),
      rim,
    };
  }
  return {
    sun: get("--color-data-categorical-orange"),
    earth: get("--color-data-categorical-blue"),
    sky: get("--color-background-body"),
    far: cardLighter ? raised : card,
    near: cardLighter ? card : raised,
    deepest: get("--surface-deepest"),
    hairline: get("--color-border"),
    rim: get("--color-border-emphasized"),
  };
}
