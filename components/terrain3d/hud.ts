import * as THREE from "three";
import type { LocalTerrainPatch } from "../../lib/data/terrain";
import { earthPhase } from "../../lib/engine/disc";
import type { Topo } from "../../lib/engine/types";
import { withAlpha } from "../panorama/layout";
import type { TerrainPalette } from "./palette";
import type { TerrainGlScene } from "./glScene";
import { HAZARD_SLOPE_DEG, CONTOUR_INTERVAL_M, sampleHeightM, type Blocker } from "./terrainModel";

export type PsrStatus = "off" | "loading" | "error" | "none" | "ready";

export interface HudArgs {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  pal: TerrainPalette;
  patch: LocalTerrainPatch;
  sc: TerrainGlScene;
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
  sunRidgeEl: number;
  earthRidgeEl: number;
  isSunLit: boolean;
  isEarthUp: boolean;
  sunBlocker: Blocker | null;
  earthBlocker: Blocker | null;
  relief: number;
}

const FONT = "500 11px ui-monospace, monospace";
const FONT_BOLD = "600 11px ui-monospace, monospace";
const DEFAULT_SUN_R = 0.2666;
const DEFAULT_EARTH_R = 0.95;

const topo = (az: number, el: number, r: number): Topo => ({ az, el, r, distKm: 0 });

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Plain-English line for why the Sun or Earth is (not) visible, naming where the blocking terrain is. */
export function blockStatus(
  name: string,
  el: number,
  ridgeEl: number,
  clear: boolean,
  blocker: Blocker | null,
  spacingM = 0,
): string {
  if (el < 0) return `${name} is below the 0° horizon plane`;
  if (clear) return `${name} clear of the ${ridgeEl.toFixed(1)}° ridge`;
  if (blocker) return `${name} blocked by terrain ${blocker.distKm.toFixed(1)} km away`;
  return `${name} blocked by terrain outside this 20 × 20 km tile or finer than its ${spacingM} m grid; that shadow is not drawn`;
}

/** Transparent 2D HUD drawn over the WebGL canvas: compass, Sun and Earth discs and labels, status text. */
export function drawHud(a: HudArgs): void {
  const { ctx, width, height, pal, patch, sc } = a;
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Compass at the four tile edges, standing on the terrain there.
  const r = patch.radiusKm;
  const edges: Array<{ label: string; e: number; n: number }> = [
    { label: "N", e: 0, n: r },
    { label: "E", e: r, n: 0 },
    { label: "S", e: 0, n: -r },
    { label: "W", e: -r, n: 0 },
  ];
  ctx.font = FONT_BOLD;
  for (const c of edges) {
    const h = sampleHeightM(patch, c.e * 0.98, c.n * 0.98) ?? patch.centerHM;
    const p = sc.project(
      new THREE.Vector3(c.e, ((h - patch.centerHM) / 1000) * a.relief + 0.35, -c.n),
      width,
      height,
    );
    if (!p.visible) continue;
    ctx.fillStyle = withAlpha(pal.sky, 0.78);
    ctx.fillRect(p.x - 9, p.y - 7, 18, 14);
    ctx.fillStyle = pal.rim;
    ctx.fillText(c.label, p.x, p.y);
  }

  // Earth disc with phase.
  const earthPt = sc.project(sc.earthPos, width, height);
  const sunPt = sc.project(sc.sunPos, width, height);
  if (earthPt.visible) {
    const phase = earthPhase(topo(a.sunAz, a.sunEl, DEFAULT_SUN_R), topo(a.earthAz, a.earthEl, DEFAULT_EARTH_R));
    const f = phase.illuminatedFraction;
    const rPx = 8;
    ctx.save();
    ctx.globalAlpha = a.isEarthUp ? 1 : 0.45;
    ctx.fillStyle = pal.deepest;
    ctx.beginPath();
    ctx.arc(earthPt.x, earthPt.y, rPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(earthPt.x, earthPt.y);
    ctx.scale(rPx, rPx);
    ctx.rotate((phase.brightLimbDeg * Math.PI) / 180);
    ctx.beginPath();
    ctx.arc(0, 0, 1, Math.PI, Math.PI * 2);
    ctx.ellipse(0, 0, 1, Math.abs(1 - 2 * f), 0, 0, Math.PI, f <= 0.5);
    ctx.closePath();
    ctx.fillStyle = pal.earth;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(earthPt.x, earthPt.y, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.font = FONT;
    ctx.fillStyle = pal.earth;
    ctx.fillText(
      `Earth ${a.earthEl >= 0 ? "+" : ""}${a.earthEl.toFixed(1)}°`,
      earthPt.x,
      Math.max(14, earthPt.y - 16),
    );
  }

  // Sun disc with glow.
  if (sunPt.visible) {
    const rPx = 9;
    ctx.save();
    ctx.globalAlpha = a.isSunLit ? 1 : 0.42;
    const g = ctx.createRadialGradient(sunPt.x, sunPt.y, 0, sunPt.x, sunPt.y, rPx * 1.6);
    g.addColorStop(0, pal.sun);
    g.addColorStop(0.55, pal.sun);
    g.addColorStop(1, withAlpha(pal.sun, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sunPt.x, sunPt.y, rPx * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.font = FONT;
    ctx.fillStyle = pal.sun;
    ctx.fillText(`Sun ${a.sunEl >= 0 ? "+" : ""}${a.sunEl.toFixed(1)}°`, sunPt.x, Math.max(14, sunPt.y - 16));
  }

  // Status text, bottom-left, wrapped to the canvas width. Legends and citations live in the page text below.
  const lines: Array<{ text: string; color: string }> = [];
  ctx.font = FONT;
  const maxW = Math.max(120, width - 20);
  const push = (text: string, color: string) => {
    for (const l of wrap(ctx, text, maxW)) lines.push({ text: l, color });
  };
  push(
    `${blockStatus("Sun", a.sunEl, a.sunRidgeEl, a.isSunLit, a.sunBlocker, patch.spacingM)} · ${blockStatus("Earth", a.earthEl, a.earthRidgeEl, a.isEarthUp, a.earthBlocker, patch.spacingM)}`,
    pal.rim,
  );

  const lh = 14;
  const top = height - 8 - lines.length * lh;
  ctx.fillStyle = withAlpha(pal.sky, 0.66);
  ctx.fillRect(4, top - 4, width - 8, lines.length * lh + 8);
  ctx.textAlign = "left";
  lines.forEach((l, i) => {
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, 10, top + i * lh + lh / 2);
  });
}

export interface TerrainNotesArgs {
  patch: LocalTerrainPatch;
  caption: string;
  surface: "shaded" | "slope";
  psr: PsrStatus;
  /** Landing ellipse radius drawn on the terrain, km (before clipping). */
  ellipseKm: number;
  ringKm: number;
  ringClipped: boolean;
}

/** Slope baseline in metres: the central difference spans two samples, and coarse patches resample 2 km data. */
export function slopeBaselineM(patch: LocalTerrainPatch): number {
  return Math.max(2 * patch.spacingM, patch.resM);
}

/** Legend, citation and caveat lines shown as page text under the 3D controls (readable by screen readers). */
export function terrainNotes(a: TerrainNotesArgs): string[] {
  const out: string[] = [];
  out.push("Drag to orbit. Ctrl+scroll or click then scroll to zoom.");
  if (a.surface === "slope") {
    out.push(
      `Tint is elevation, contours every ${CONTOUR_INTERVAL_M} m; amber marks slopes over ${HAZARD_SLOPE_DEG}° over a ${slopeBaselineM(a.patch)} m baseline, so metre-scale slopes can be steeper`,
    );
  }
  if (a.psr === "loading") out.push("Loading permanent-shadow polygons");
  else if (a.psr === "error") out.push("Permanent-shadow data could not be loaded");
  else if (a.psr === "none") out.push("No mapped PSR (≥ 1 km²) inside this tile");
  else if (a.psr === "ready")
    out.push("PSR: zero average sunlight over 18.6 yr, NASA PGDA 120 m (Mazarico et al. 2011); PSRs under 1 km² are not mapped");
  out.push(
    `Dashed ring: ${a.ringKm.toFixed(2)} km landing ellipse radius${a.ringClipped ? `, clipped to the tile (requested ${a.ellipseKm} km)` : ""}`,
  );
  out.push("Lander symbol enlarged, not to scale. Sky elevations are exaggerated by the relief factor.");
  out.push("Local terrain only; ridge values come from terrain 100 to 200 km away");
  out.push(a.caption);
  return out;
}
