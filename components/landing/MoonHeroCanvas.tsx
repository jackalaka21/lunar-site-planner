"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface SitePin {
  id: string;
  label: string;
  lat: number;
  lon: number;
  highlight?: boolean;
}

/** Featured catalogue sites. Coordinates come from public/data/v1/sites.json by id, never hard-coded. */
const FEATURED_SITES: Array<{ siteId: string; name: string; highlight?: boolean }> = [
  { siteId: "artemis3-mons-mouton", name: "Mons Mouton · IM-2", highlight: true },
  { siteId: "shackleton-rim", name: "Shackleton rim", highlight: true },
  { siteId: "chandrayaan-3", name: "Chandrayaan-3" },
  { siteId: "slim", name: "JAXA SLIM" },
  { siteId: "apollo-11", name: "Apollo 11" },
];

interface CatalogSite {
  id: string;
  lat: number;
  lon: number;
}

/** Latitude text derived from the data, e.g. "84.8°S". */
export function latText(lat: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"}`;
}

export function pinsFromCatalog(sites: CatalogSite[]): SitePin[] {
  const out: SitePin[] = [];
  for (const f of FEATURED_SITES) {
    const site = sites.find((x) => x.id === f.siteId);
    if (!site) continue;
    out.push({
      id: f.siteId,
      label: `${f.name} (${latText(site.lat)})`,
      lat: site.lat,
      lon: site.lon,
      highlight: f.highlight,
    });
  }
  return out;
}

/** Values the landing's scroll loop writes every frame and the HUD canvases read. */
export interface HudDrive {
  /** Smoothed scroll progress 0..1. */
  p: number;
  /** Stage size in CSS px. */
  w: number;
  h: number;
  /** Moon centre and radius on screen, CSS px. */
  mx: number;
  my: number;
  mr: number;
  /** Layer opacities 0..1: orbital HUD and showcase HUD. */
  heroVis: number;
  showVis: number;
  /** Sun direction of the active showcase stage, degrees. */
  phaseDeg: number;
  wide: boolean;
}

export const INITIAL_DRIVE: HudDrive = {
  p: 0,
  w: 0,
  h: 0,
  mx: 0,
  my: 0,
  mr: 0,
  heroVis: 1,
  showVis: 0,
  phaseDeg: -34,
  wide: true,
};

const STARS: Array<{ x: number; y: number; r: number; phase: number; depth: number }> = Array.from(
  { length: 90 },
  (_, i) => ({
    x: ((i * 73 + 19) % 1000) / 1000,
    y: ((i * 41 + 7) % 1000) / 1000,
    r: (i % 4) * 0.3 + 0.5,
    phase: i * 0.67,
    depth: 0.35 + ((i * 29) % 65) / 100,
  }),
);

const AMBER = "255,180,84";
const CYAN = "94,200,255";
const MONO = '500 11px var(--font-family-code), "IBM Plex Mono", monospace';

export interface MoonHeroCanvasProps {
  /** "hero": orbital HUD over the video. "showcase": lighting HUD over the low-altitude frames. */
  variant: "hero" | "showcase";
  drive: RefObject<HudDrive>;
  reducedMotion?: boolean;
}

/**
 * Transparent HUD canvases drawn over the landing media. The Moon itself is the video / descent frames;
 * everything drawn here is labelled illustrative and carries no engine numbers.
 */
export function MoonHeroCanvas({ variant, drive, reducedMotion = false }: MoonHeroCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef(0);

  useEffect(() => {
    if (variant !== "showcase") return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [variant]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let bufW = 0;
    let bufH = 0;
    let phase = drive.current.phaseDeg;

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      const d = drive.current;
      const vis = variant === "hero" ? d.heroVis : d.showVis;
      canvas.style.opacity = String(vis);
      if (vis < 0.01 || d.w <= 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.round(d.w * dpr);
      const bh = Math.round(d.h * dpr);
      if (bw !== bufW || bh !== bufH) {
        canvas.width = bw;
        canvas.height = bh;
        bufW = bw;
        bufH = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, d.w, d.h);
      ctx.font = MONO;
      if (variant === "hero") drawHero(ctx, d, now, reducedMotion);
      else {
        phase += (d.phaseDeg + pointerRef.current * 5 - phase) * 0.08;
        drawShowcase(ctx, d, phase);
      }
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [drive, variant, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={variant === "hero" ? "moon-hero-canvas" : "moon-showcase-canvas"}
      aria-label={
        variant === "hero"
          ? "Illustrative orbital view: grazing Sun ray and a direct-to-Earth line"
          : "Illustrative lighting angle for the selected stage"
      }
      role="img"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

/** Text on a dark rounded pill so it stays readable over the bright Moon and terrain. */
function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  color: string,
  size: number,
) {
  ctx.font = `500 ${size}px var(--font-family-code), "IBM Plex Mono", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const w = ctx.measureText(text).width;
  const padX = 6;
  const hh = size + 8;
  const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const top = baseline === "top" ? y - 4 : baseline === "bottom" ? y - hh + 4 : y - hh / 2;
  ctx.fillStyle = "rgba(3,3,5,0.72)";
  ctx.beginPath();
  ctx.roundRect(left - padX, top, w + padX * 2, hh, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawHero(ctx: CanvasRenderingContext2D, d: HudDrive, now: number, reduced: boolean) {
  const { w, h, mx, my, mr } = d;
  // Parallax starfield, drawn faintly so it reads as depth rather than content.
  for (const s of STARS) {
    const tw = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(now * 0.0012 + s.phase);
    const y = (((s.y * h - d.p * 140 * s.depth) % h) + h) % h;
    const x = s.x * w;
    if (Math.hypot(x - mx, y - my) < mr * 1.02) continue;
    ctx.fillStyle = `rgba(235,232,224,${(0.12 + 0.3 * tw) * s.depth})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const small = !d.wide;
  // Grazing Sun ray: arrives from the lit (right) side just under the south limb.
  const sy = my + mr * 0.9;
  const sx = mx + mr * 0.42;
  const sun = ctx.createLinearGradient(w, sy - mr * 0.1, sx, sy);
  sun.addColorStop(0, `rgba(${AMBER},0)`);
  sun.addColorStop(1, `rgba(${AMBER},0.85)`);
  ctx.strokeStyle = sun;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w, sy - mr * 0.1);
  ctx.lineTo(sx, sy);
  ctx.stroke();
  ctx.fillStyle = `rgba(${AMBER},0.95)`;
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  const fs = small ? 12 : 12;
  label(
    ctx,
    small ? "Sun ray (illustrative)" : "Sun, grazing ray (illustrative)",
    w - (small ? 12 : 24),
    small ? sy + 12 : sy - mr * 0.1 - 14,
    "right",
    small ? "top" : "bottom",
    `rgb(${AMBER})`,
    fs,
  );

  // Direct-to-Earth line from the upper limb to an Earth marker.
  const ex = small ? 22 : w * 0.92;
  const ey = small ? my - mr * 0.88 : Math.max(88, my - mr * 1.18);
  const lx = small ? mx - mr * 0.45 : mx + mr * 0.5;
  const ly = my - mr * 0.86;
  ctx.strokeStyle = `rgba(${CYAN},0.8)`;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(${CYAN},0.95)`;
  ctx.beginPath();
  ctx.arc(ex, ey, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
  ctx.fill();
  label(
    ctx,
    small ? "Earth (illustrative)" : "Direct-to-Earth line (illustrative)",
    small ? ex - 6 : ex + 4,
    ey - 12,
    small ? "left" : "right",
    "bottom",
    `rgb(${CYAN})`,
    12,
  );
}

function drawShowcase(ctx: CanvasRenderingContext2D, d: HudDrive, phaseDeg: number) {
  const { w, h } = d;
  const th = (phaseDeg * Math.PI) / 180;
  // Sun marker rides an arc across the upper frame.
  const sx = w * (0.5 + Math.sin(th) * 0.4);
  const sy = h * 0.2 - Math.cos(th) * h * 0.06;

  // Lighting: warm the sun side and let the far side fall away.
  const shade = ctx.createLinearGradient(sx, 0, w - sx > sx ? w : 0, 0);
  shade.addColorStop(0, `rgba(${AMBER},0.1)`);
  shade.addColorStop(0.5, "rgba(3,3,5,0.06)");
  shade.addColorStop(1, "rgba(3,3,5,0.5)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  // Arc and ticks (1 px hairlines).
  ctx.strokeStyle = "rgba(235,232,224,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let a = -75; a <= 75; a += 3) {
    const r = (a * Math.PI) / 180;
    const x = w * (0.5 + Math.sin(r) * 0.4);
    const y = h * 0.2 - Math.cos(r) * h * 0.06;
    if (a === -75) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Ray from the Sun marker down toward the surface.
  const ray = ctx.createLinearGradient(sx, sy, w * 0.5, h * 0.62);
  ray.addColorStop(0, `rgba(${AMBER},0.7)`);
  ray.addColorStop(1, `rgba(${AMBER},0)`);
  ctx.strokeStyle = ray;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(w * 0.5, h * 0.62);
  ctx.stroke();

  ctx.fillStyle = `rgba(${AMBER},1)`;
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${AMBER},0.5)`;
  ctx.beginPath();
  ctx.arc(sx, sy, 10, 0, Math.PI * 2);
  ctx.stroke();

  const lx = Math.min(w - 120, Math.max(120, sx));
  label(ctx, "Sun direction (illustrative)", lx, sy - 24, "center", "bottom", `rgb(${AMBER})`, d.wide ? 12 : 13);
}
