"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTheme } from "@astryxdesign/core/theme";
import { withAlpha } from "../panorama/layout";
import { panoramaPalette } from "../panorama/palette";

interface SitePin {
  label: string;
  lat: number;
  lon: number;
  highlight?: boolean;
}

const FEATURED_PINS: SitePin[] = [
  { label: "Mons Mouton (84.8°S)", lat: -84.78, lon: 29.13, highlight: true },
  { label: "Shackleton Rim (89.7°S)", lat: -89.67, lon: 125.0, highlight: true },
  { label: "Chandrayaan-3 (69.4°S)", lat: -69.37, lon: 32.32 },
  { label: "SLIM (13.3°S)", lat: -13.32, lon: 25.25 },
  { label: "Apollo 11 (0.7°N)", lat: 0.67, lon: 23.47 },
];

const STARS: Array<{ x: number; y: number; r: number; phase: number }> = Array.from(
  { length: 78 },
  (_, i) => ({
    x: ((i * 73 + 19) % 100) / 100,
    y: ((i * 41 + 7) % 100) / 100,
    r: (i % 3) * 0.48 + 0.6,
    phase: i * 0.7,
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
  /** "hero" renders the full 3D globe; "horizon" renders the closing lunar horizon glow arc. */
  variant?: "hero" | "horizon";
}

export function MoonHeroCanvas({
  height = 340,
  phaseDeg = -28,
  focusLatDeg = -42,
  focusLonDeg = 24,
  variant = "hero",
}: MoonHeroCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const rotRef = useRef({
    lon: focusLonDeg,
    lat: focusLatDeg,
    phase: phaseDeg,
    targetLonOffset: 0,
    targetLatOffset: 0,
    scrollOffset: 0,
  });
  const basemapRef = useRef<HTMLImageElement | null>(null);
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
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const y = window.scrollY || 0;
      rotRef.current.scrollOffset = Math.min(1, Math.max(0, y / 700));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    let animId = 0;
    let t0 = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      const st = rotRef.current;
      st.lon = (st.lon + dt * 3.8) % 360;
      st.phase += (phaseDeg - st.phase) * 0.08;
      st.lat += (focusLatDeg - st.lat) * 0.06;

      const cLon = st.lon + st.targetLonOffset;
      const cLat = Math.max(-72, Math.min(-12, st.lat + st.targetLatOffset));
      const pal = panoramaPalette(mode);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Deep space background with subtle radial depth
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        variant === "horizon" ? height * 1.35 : height * 0.52,
        10,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.78,
      );
      bgGrad.addColorStop(0, pal.sky);
      bgGrad.addColorStop(1, pal.deepest);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Faint twinkling starfield
      for (const s of STARS) {
        const twinkle = 0.28 + 0.45 * Math.sin(now * 0.0014 + s.phase);
        ctx.fillStyle = withAlpha(pal.rim, Math.max(0.12, Math.min(0.75, twinkle)));
        ctx.beginPath();
        ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (variant === "horizon") {
        // Closing soft lunar horizon glow at the bottom of the viewport
        const arcR = Math.max(width * 0.95, 520);
        const arcCx = width * 0.5;
        const arcCy = height + arcR - 38;

        const horizonGlow = ctx.createRadialGradient(
          arcCx,
          arcCy,
          arcR * 0.94,
          arcCx,
          arcCy,
          arcR * 1.08,
        );
        horizonGlow.addColorStop(0, withAlpha(pal.sun, 0.26));
        horizonGlow.addColorStop(0.45, withAlpha(pal.earth, 0.14));
        horizonGlow.addColorStop(1, withAlpha(pal.deepest, 0));
        ctx.fillStyle = horizonGlow;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR * 1.08, Math.PI * 1.15, Math.PI * 1.85);
        ctx.fill();

        ctx.fillStyle = pal.near;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = withAlpha(pal.sun, 0.65);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(arcCx, arcCy, arcR, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();

        ctx.font = "500 11px var(--font-family-code), monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = pal.rim;
        ctx.fillText(
          "84°S–90°S Lunar South Pole · NASA LOLA 40 m DEM & JPL DE440 Ephemeris",
          width * 0.5,
          height - 10,
        );
        animId = window.requestAnimationFrame(renderFrame);
        return;
      }

      const parallaxScale = 1 - st.scrollOffset * 0.06;
      const parallaxY = st.scrollOffset * 12;
      const cx = width * 0.5;
      const cy = height * 0.5 + parallaxY;
      const rPx = Math.max(72, Math.min(width * 0.36, height * 0.41) * parallaxScale);

      const phaseRad = (st.phase * Math.PI) / 180;
      const sunShiftX = Math.sin(phaseRad) * rPx * 0.55;

      // Ambient atmospheric / solar corona glow around the Moon
      const corona = ctx.createRadialGradient(
        cx + sunShiftX * 0.35,
        cy + rPx * 0.12,
        rPx * 0.72,
        cx,
        cy,
        rPx * 1.55,
      );
      corona.addColorStop(0, withAlpha(pal.sun, 0.24));
      corona.addColorStop(0.45, withAlpha(pal.earth, 0.1));
      corona.addColorStop(1, withAlpha(pal.deepest, 0));
      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx * 1.55, 0, Math.PI * 2);
      ctx.fill();

      // Lunar sphere clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.clip();

      // Base illuminated sphere gradient controlled by phaseDeg
      const litGrad = ctx.createRadialGradient(
        cx + sunShiftX - rPx * 0.22,
        cy + rPx * 0.18,
        rPx * 0.08,
        cx,
        cy,
        rPx * 1.18,
      );
      litGrad.addColorStop(0, withAlpha(pal.rim, 0.42));
      litGrad.addColorStop(0.58, pal.near);
      litGrad.addColorStop(1, pal.deepest);
      ctx.fillStyle = litGrad;
      ctx.fillRect(cx - rPx, cy - rPx, rPx * 2, rPx * 2);

      // Real NASA LOLA global relief texture scrolling across the sphere
      const img = basemapRef.current;
      if (img && img.width > 0) {
        ctx.save();
        ctx.globalAlpha = 0.48;
        const shiftPx = (((cLon % 360) + 360) % 360) * ((rPx * 2) / 180);
        const drawW = rPx * 4;
        const drawH = rPx * 2;
        ctx.drawImage(img, cx - rPx - shiftPx, cy - rPx, drawW, drawH);
        ctx.drawImage(img, cx - rPx - shiftPx + drawW, cy - rPx, drawW, drawH);
        ctx.restore();
      }

      // Dynamic terminator shadow driven by phaseDeg
      const termGrad = ctx.createLinearGradient(
        cx + sunShiftX - rPx,
        cy + rPx * 0.3,
        cx + sunShiftX + rPx,
        cy - rPx * 0.3,
      );
      if (st.phase <= 0) {
        termGrad.addColorStop(0, withAlpha(pal.sun, 0.15));
        termGrad.addColorStop(0.52, withAlpha(pal.deepest, 0.08));
        termGrad.addColorStop(1, withAlpha(pal.deepest, 0.86));
      } else {
        termGrad.addColorStop(0, withAlpha(pal.deepest, 0.84));
        termGrad.addColorStop(0.48, withAlpha(pal.deepest, 0.08));
        termGrad.addColorStop(1, withAlpha(pal.sun, 0.16));
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
      ctx.lineWidth = 1.6;
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

      // Atmospheric rim highlight
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();

      // Grazing Sun ray & Earth communication sightline vectors at the South Pole
      const polePt = projectSphere(-90, 0, cLat, cLon, cx, cy, rPx);
      if (polePt.visible) {
        ctx.save();
        ctx.strokeStyle = withAlpha(pal.sun, 0.85);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(16, polePt.y + 10);
        ctx.lineTo(polePt.x, polePt.y);
        ctx.stroke();

        ctx.strokeStyle = withAlpha(pal.earth, 0.85);
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
      for (const site of FEATURED_PINS) {
        const p = projectSphere(site.lat, site.lon, cLat, cLon, cx, cy, rPx);
        if (!p.visible) continue;

        ctx.fillStyle = site.highlight ? pal.sun : pal.earth;
        ctx.beginPath();
        ctx.arc(p.x, p.y, site.highlight ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = pal.deepest;
        ctx.lineWidth = 1;
        ctx.stroke();

        if (site.highlight || p.z > 0.35) {
          const isSouthPole = site.lat < -88;
          const alignRight = isSouthPole ? false : site.highlight ? true : p.x > cx;
          ctx.textAlign = alignRight ? "left" : "right";
          ctx.textBaseline = "middle";
          const lx = alignRight ? p.x + 8 : p.x - 8;
          const ly = isSouthPole ? p.y + 6 : site.highlight ? p.y - 5 : p.y;
          ctx.fillStyle = site.highlight ? pal.sun : pal.rim;
          ctx.fillText(site.label, lx, ly);
        }
      }

      // Top & bottom technical callouts on the globe canvas
      ctx.font = "500 11px var(--font-family-code), monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = pal.sun;
      ctx.fillText("Sun grazing ~1.5° at South Pole", 14, 12);

      ctx.textAlign = "right";
      ctx.fillStyle = pal.earth;
      ctx.fillText("Earth 14-day libration sightline", width - 14, 12);

      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = pal.rim;
      ctx.fillText(
        "Drag or hover globe · NASA LOLA 40 m DEM & JPL DE440 Ephemeris",
        width / 2,
        height - 10,
      );
      ctx.restore();

      animId = window.requestAnimationFrame(renderFrame);
    };

    animId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(animId);
  }, [width, height, mode, phaseDeg, focusLatDeg, focusLonDeg, variant]);

  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const nx = ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const ny = ((ev.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
    rotRef.current.targetLonOffset = nx * 32;
    rotRef.current.targetLatOffset = -ny * 16;
  };

  const onPointerLeave = () => {
    rotRef.current.targetLonOffset = 0;
    rotRef.current.targetLatOffset = 0;
  };

  return (
    <div
      ref={wrapRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid={variant === "horizon" ? "moon-horizon-glow" : "moon-hero-canvas"}
        aria-label={
          variant === "horizon"
            ? "Lunar south-polar horizon glow"
            : "Interactive 3D lunar globe showing south-polar grazing sunlight and mission landing sites"
        }
        style={{
          display: "block",
          width: "100%",
          height,
        }}
      />
    </div>
  );
}
