"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTheme } from "@astryxdesign/core/theme";
import { withAlpha } from "../panorama/layout";
import { panoramaPalette } from "../panorama/palette";

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

const STARS: Array<{ x: number; y: number; r: number; phase: number; depth: number }> = Array.from(
  { length: 124 },
  (_, i) => ({
    x: ((i * 73 + 19) % 1000) / 1000,
    y: ((i * 41 + 7) % 1000) / 1000,
    r: (i % 4) * 0.42 + 0.48,
    phase: i * 0.67,
    depth: 0.35 + ((i * 29) % 65) / 100,
  }),
);

function projectSphere(
  latDeg: number,
  lonDeg: number,
  centerLatDeg: number,
  centerLonDeg: number,
  cx: number,
  cy: number,
  rPx: number,
): { x: number; y: number; z: number; visible: boolean } {
  const phi = (latDeg * Math.PI) / 180;
  const phi0 = (centerLatDeg * Math.PI) / 180;
  const dLam = ((lonDeg - centerLonDeg) * Math.PI) / 180;

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const cosLam = Math.cos(dLam);
  const sinLam = Math.sin(dLam);

  const nx = cosPhi * sinLam;
  const ny = cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosLam;
  const nz = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosLam;

  return {
    x: cx + nx * rPx,
    y: cy - ny * rPx,
    z: nz,
    visible: nz >= -0.02,
  };
}

export interface MoonHeroCanvasProps {
  height?: number;
  /** Solar illumination phase angle in degrees (-75 to +75) for smooth lighting transitions. */
  phaseDeg?: number;
  /** Target camera latitude in degrees. */
  focusLatDeg?: number;
  /** Target camera longitude in degrees. */
  focusLonDeg?: number;
  /**
   * "hero": centerpiece 3D Moon (airless: no halo) with LOLA relief, and scroll parallax;
   * "showcase": focused interactive stage preview;
   * "horizon": wide closing lunar horizon arc at the bottom of the landing page.
   */
  variant?: "hero" | "showcase" | "horizon";
}

export function MoonHeroCanvas({
  height,
  phaseDeg = -28,
  focusLatDeg = -42,
  focusLonDeg = 28,
  variant = "hero",
}: MoonHeroCanvasProps) {
  const resolvedHeight =
    height ?? (variant === "horizon" ? 150 : variant === "showcase" ? 260 : 440);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const rotRef = useRef({
    baseLon: focusLonDeg,
    autoLon: 0,
    lat: focusLatDeg,
    phase: phaseDeg,
    targetLonOffset: 0,
    targetLatOffset: 0,
    dragLonOffset: 0,
    dragLatOffset: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    scrollOffset: 0,
  });
  const basemapRef = useRef<HTMLImageElement | null>(null);
  const pinsRef = useRef<SitePin[]>([]);
  const { mode } = useTheme();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof Image === "undefined") return;
    const img = new Image();
    img.src = "/data/v1/basemaps/global-2048.webp";
    img.onload = () => {
      basemapRef.current = img;
    };
  }, []);

  useEffect(() => {
    if (typeof fetch === "undefined") return;
    let cancelled = false;
    fetch("/data/v1/sites.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc: { sites: CatalogSite[] }) => {
        if (!cancelled) pinsRef.current = pinsFromCatalog(doc.sites);
      })
      .catch(() => {
        /* pins are decorative: draw none if the catalogue cannot be read */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || variant !== "hero") return;
    const onScroll = () => {
      const y = window.scrollY || 0;
      rotRef.current.scrollOffset = Math.min(1, Math.max(0, y / 750));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  useEffect(() => {
    if (width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(resolvedHeight * dpr);

    let animId = 0;
    let t0 = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      const st = rotRef.current;
      const spinSpeed = variant === "showcase" ? 1.4 : 3.4;
      if (!st.dragging) {
        st.autoLon = (st.autoLon + dt * spinSpeed) % 360;
      }
      const lonDelta = ((focusLonDeg - st.baseLon + 540) % 360) - 180;
      st.baseLon = (st.baseLon + lonDelta * 0.08 + 360) % 360;
      st.phase += (phaseDeg - st.phase) * 0.08;
      st.lat += (focusLatDeg - st.lat) * 0.07;

      const cLon =
        (variant === "showcase" ? st.baseLon + st.autoLon * 0.35 : st.baseLon + st.autoLon) +
        st.targetLonOffset +
        st.dragLonOffset;
      const cLat = Math.max(
        -78,
        Math.min(-8, st.lat + st.targetLatOffset + st.dragLatOffset),
      );
      const pal = panoramaPalette(mode);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, resolvedHeight);

      // Deep space background with subtle radial depth
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        variant === "horizon" ? resolvedHeight * 1.35 : resolvedHeight * 0.5,
        12,
        width * 0.5,
        resolvedHeight * 0.5,
        Math.max(width, resolvedHeight) * 0.85,
      );
      bgGrad.addColorStop(0, pal.sky);
      bgGrad.addColorStop(1, pal.deepest);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, resolvedHeight);

      // Deep-space twinkling starfield with parallax depth
      const scrollShiftY = variant === "hero" ? st.scrollOffset * 18 : 0;
      for (const s of STARS) {
        const twinkle = 0.25 + 0.5 * Math.sin(now * 0.0015 + s.phase);
        const sy = (s.y * resolvedHeight - scrollShiftY * s.depth + resolvedHeight) % resolvedHeight;
        ctx.fillStyle = withAlpha(pal.rim, Math.max(0.1, Math.min(0.8, twinkle * s.depth)));
        ctx.beginPath();
        ctx.arc(s.x * width, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (variant === "horizon") {
        // Wide closing lunar horizon arc at the bottom of the landing page
        const arcR = Math.max(width * 0.96, 560);
        const arcCx = width * 0.5;
        const arcCy = resolvedHeight + arcR - 52;

        ctx.fillStyle = pal.near;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, 0, Math.PI * 2);
        ctx.fill();

        // Subtle illuminated limb
        ctx.strokeStyle = withAlpha(pal.sun, 0.72);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();

        ctx.font = "500 11px var(--font-family-code), monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = pal.rim;
        ctx.fillText(
          "84°S–90°S Lunar South Pole · NASA LOLA DEM & JPL DE440 Ephemeris",
          width * 0.5,
          resolvedHeight - 12,
        );
        animId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const parallaxScale = variant === "hero" ? 1 - st.scrollOffset * 0.08 : 1;
      const parallaxY = variant === "hero" ? st.scrollOffset * 16 : 0;
      const cx = width * 0.5;
      const cy = resolvedHeight * 0.5 + parallaxY;
      const radiusRatio = variant === "showcase" ? 0.37 : 0.39;
      const rPx = Math.max(
        76,
        Math.min(width * 0.38, resolvedHeight * radiusRatio) * parallaxScale,
      );

      const phaseRad = (st.phase * Math.PI) / 180;
      const sunShiftX = Math.sin(phaseRad) * rPx * 0.62;
      const sunShiftY = Math.cos(phaseRad) * rPx * 0.16;

      // Lunar sphere clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.clip();

      // Base illuminated sphere gradient controlled by phaseDeg
      const litGrad = ctx.createRadialGradient(
        cx + sunShiftX - rPx * 0.2,
        cy + sunShiftY + rPx * 0.16,
        rPx * 0.06,
        cx,
        cy,
        rPx * 1.2,
      );
      litGrad.addColorStop(0, withAlpha(pal.rim, 0.46));
      litGrad.addColorStop(0.56, pal.near);
      litGrad.addColorStop(1, pal.deepest);
      ctx.fillStyle = litGrad;
      ctx.fillRect(cx - rPx, cy - rPx, rPx * 2, rPx * 2);

      // Real NASA LOLA global relief texture scrolling across the sphere
      const img = basemapRef.current;
      if (img && img.width > 0) {
        ctx.save();
        ctx.globalAlpha = 0.52;
        const shiftPx = (((cLon % 360) + 360) % 360) * ((rPx * 2) / 180);
        const drawW = rPx * 4;
        const drawH = rPx * 2;
        ctx.drawImage(img, cx - rPx - shiftPx, cy - rPx, drawW, drawH);
        ctx.drawImage(img, cx - rPx - shiftPx + drawW, cy - rPx, drawW, drawH);
        ctx.restore();
      }

      // Dynamic 3D terminator shadow driven by phaseDeg
      const termGrad = ctx.createLinearGradient(
        cx + sunShiftX - rPx,
        cy + rPx * 0.28,
        cx + sunShiftX + rPx,
        cy - rPx * 0.28,
      );
      if (st.phase <= 0) {
        termGrad.addColorStop(0, withAlpha(pal.sun, 0.16));
        termGrad.addColorStop(0.5, withAlpha(pal.deepest, 0.08));
        termGrad.addColorStop(1, withAlpha(pal.deepest, 0.88));
      } else {
        termGrad.addColorStop(0, withAlpha(pal.deepest, 0.86));
        termGrad.addColorStop(0.5, withAlpha(pal.deepest, 0.08));
        termGrad.addColorStop(1, withAlpha(pal.sun, 0.18));
      }
      ctx.fillStyle = termGrad;
      ctx.fillRect(cx - rPx, cy - rPx, rPx * 2, rPx * 2);

      // Selenographic latitude/longitude graticule
      ctx.strokeStyle = withAlpha(pal.rim, 0.24);
      ctx.lineWidth = 0.8;
      for (const lat of [-80, -60, -30, 0, 30]) {
        ctx.beginPath();
        let open = false;
        for (let lon = -180; lon <= 180; lon += 6) {
          const p = projectSphere(lat, lon, cLat, cLon, cx, cy, rPx);
          if (!p.visible) {
            open = false;
            continue;
          }
          if (!open) {
            ctx.moveTo(p.x, p.y);
            open = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      }
      for (let lon = -150; lon <= 180; lon += 30) {
        ctx.beginPath();
        let open = false;
        for (let lat = -85; lat <= 85; lat += 5) {
          const p = projectSphere(lat, lon, cLat, cLon, cx, cy, rPx);
          if (!p.visible) {
            open = false;
            continue;
          }
          if (!open) {
            ctx.moveTo(p.x, p.y);
            open = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
        ctx.stroke();
      }

      // Highlighted 84°S South-Polar Grazing Sunlight Zone ring
      ctx.strokeStyle = pal.sun;
      ctx.lineWidth = 1.7;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      let polarOpen = false;
      for (let lon = -180; lon <= 180; lon += 5) {
        const p = projectSphere(-84, lon, cLat, cLon, cx, cy, rPx);
        if (!p.visible) {
          polarOpen = false;
          continue;
        }
        if (!polarOpen) {
          ctx.moveTo(p.x, p.y);
          polarOpen = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Limb outline (airless body, no halo)
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();

      // Grazing Sun ray & Earth communication sightline vectors at the South Pole
      const polePt = projectSphere(-90, 0, cLat, cLon, cx, cy, rPx);
      if (polePt.visible) {
        ctx.save();
        ctx.strokeStyle = withAlpha(pal.sun, 0.86);
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.moveTo(16, polePt.y + 10);
        ctx.lineTo(polePt.x, polePt.y);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(pal.earth, 0.86);
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(polePt.x, polePt.y);
        ctx.lineTo(width - 16, polePt.y - 18);
        ctx.stroke();
        ctx.restore();
      }

      // Plot mission site beacons on the rotating globe
      ctx.save();
      ctx.font = "500 11px var(--font-family-code), monospace";
      for (const site of pinsRef.current) {
        const p = projectSphere(site.lat, site.lon, cLat, cLon, cx, cy, rPx);
        if (!p.visible) continue;

        const isActiveFocus =
          Math.abs(site.lon - focusLonDeg) < 25 && Math.abs(site.lat - focusLatDeg) < 45;
        const emphasized = site.highlight || isActiveFocus;

        if (emphasized) {
          ctx.strokeStyle = withAlpha(pal.sun, 0.45);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = emphasized ? pal.sun : pal.earth;
        ctx.beginPath();
        ctx.arc(p.x, p.y, emphasized ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = pal.deepest;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (emphasized || p.z > 0.35) {
          const isSouthPole = site.lat < -88;
          const alignRight = isSouthPole ? false : emphasized ? true : p.x > cx;
          ctx.textAlign = alignRight ? "left" : "right";
          ctx.textBaseline = "middle";
          const lx = alignRight ? p.x + 9 : p.x - 9;
          const ly = isSouthPole ? p.y + 7 : emphasized ? p.y - 5 : p.y;
          ctx.fillStyle = emphasized ? pal.sun : pal.rim;
          ctx.fillText(site.label, lx, ly);
        }
      }

      // Technical callouts on the globe canvas
      ctx.font = "500 11px var(--font-family-code), monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = pal.sun;
      ctx.fillText("Sun grazing ~1.5° at the pole (illustrative)", 14, 12);

      ctx.textAlign = "right";
      ctx.fillStyle = pal.earth;
      ctx.fillText("Earth direction (illustrative)", width - 14, 12);

      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = pal.rim;
      ctx.fillText(
        variant === "showcase"
          ? "Interactive lighting stage · NASA LOLA DEM & JPL DE440"
          : "Drag or hover globe · NASA LOLA DEM & JPL DE440 Ephemeris",
        width / 2,
        resolvedHeight - 10,
      );
      ctx.restore();

      animId = window.requestAnimationFrame(renderFrame);
    };

    animId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(animId);
  }, [width, resolvedHeight, mode, phaseDeg, focusLatDeg, focusLonDeg, variant]);

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (variant === "horizon") return;
    rotRef.current.dragging = true;
    rotRef.current.dragStartX = ev.clientX - rotRef.current.dragLonOffset * 3;
    rotRef.current.dragStartY = ev.clientY - rotRef.current.dragLatOffset * 4;
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (variant === "horizon") return;
    const rect = ev.currentTarget.getBoundingClientRect();
    if (rotRef.current.dragging) {
      rotRef.current.dragLonOffset = (ev.clientX - rotRef.current.dragStartX) / 3;
      rotRef.current.dragLatOffset = Math.max(
        -24,
        Math.min(24, -(ev.clientY - rotRef.current.dragStartY) / 4),
      );
      return;
    }
    const nx = ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const ny = ((ev.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
    rotRef.current.targetLonOffset = nx * 28;
    rotRef.current.targetLatOffset = -ny * 14;
  };

  const onPointerUpOrLeave = () => {
    rotRef.current.dragging = false;
    rotRef.current.targetLonOffset = 0;
    rotRef.current.targetLatOffset = 0;
  };

  const testId =
    variant === "horizon"
      ? "moon-horizon-glow"
      : variant === "showcase"
        ? "moon-showcase-canvas"
        : "moon-hero-canvas";

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpOrLeave}
      onPointerLeave={onPointerUpOrLeave}
      style={{
        position: "relative",
        width: "100%",
        height: resolvedHeight,
        borderRadius: 12,
        overflow: "hidden",
        cursor: variant === "horizon" ? "default" : "grab",
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid={testId}
        aria-label={
          variant === "horizon"
            ? "Lunar south-polar horizon arc"
            : variant === "showcase"
              ? "Interactive 3D lunar lighting showcase"
              : "Interactive 3D lunar globe showing south-polar grazing sunlight and mission landing sites"
        }
        style={{
          display: "block",
          width: "100%",
          height: resolvedHeight,
        }}
      />
    </div>
  );
}
