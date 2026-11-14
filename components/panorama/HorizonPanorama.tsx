"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { useTheme } from "@astryxdesign/core/theme";
import { horizonAt } from "../../lib/engine/horizon";
import { earthPhase } from "../../lib/engine/disc";
import type { TimeSeries } from "../../lib/engine/sample";
import type { HorizonProfile, Topo } from "../../lib/engine/types";
import { panoramaPalette } from "./palette";
import { azToX, elScale, exaggeration, splitAtWrap, withAlpha, type AzEl } from "./layout";

export interface HorizonPanoramaProps {
  horizon: HorizonProfile;
  series: TimeSeries;
  /** Index into the series of the instant shown by the Sun and Earth discs. */
  cursorIndex: number;
  /** Shared elevation domain (deg), from sharedElDomain. */
  elDomain: [number, number];
  /** Azimuth shown at the middle of the canvas (deg). Default 180. */
  centerAz?: number;
  /** Called while dragging empty sky with the time change in ms (1 px = 1 h at default zoom). */
  onScrubTime?: (deltaMs: number) => void;
  /** Angular radii (deg) of the discs. The series does not carry them; defaults are the mean values. */
  sunRDeg?: number;
  earthRDeg?: number;
  /** True when the site is at a pole: the N label then explains the pole convention. */
  pole?: boolean;
  /** Canvas height in CSS px. */
  height?: number;
}

const DEFAULT_SUN_R = 0.2666;
const DEFAULT_EARTH_R = 0.95;
const MS_PER_HOUR = 3_600_000;
const PX_PER_HOUR = 1;
const MIN_DISC_PX = 1.5;
const TICK_PX = 4;
const NEAR_ERODE_DEG = 2;
const OFFSCREEN_DEG = 1;
const LABEL_GAP_PX = 4;
const POLE_NORTH = "At the pole, north = toward 0° longitude";
const COMPASS: Array<{ az: number; label: string }> = [
  { az: 0, label: "N" },
  { az: 90, label: "E" },
  { az: 180, label: "S" },
  { az: 270, label: "W" },
];

const fmt = (v: number) => v.toFixed(1);

function topoAt(az: number, el: number, r: number): Topo {
  return { az, el, r, distKm: 0 };
}

export function HorizonPanorama({
  horizon,
  series,
  cursorIndex,
  elDomain,
  centerAz = 180,
  onScrubTime,
  sunRDeg = DEFAULT_SUN_R,
  earthRDeg = DEFAULT_EARTH_R,
  pole = false,
  height = 240,
}: HorizonPanoramaProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const northRef = useRef<SVGTextElement>(null);
  const [width, setWidth] = useState(0);
  const [panAz, setPanAz] = useState(0);
  const drag = useRef<{ x: number; touch: boolean } | null>(null);
  const { mode } = useTheme();

  const center = centerAz + panAz;
  const [lo, hi] = elDomain;
  const exag = width > 0 ? exaggeration(width, height, elDomain) : 1;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const idx = Math.min(Math.max(cursorIndex, 0), Math.max(series.n - 1, 0));
  const sunAz = series.sunAz[idx] ?? 0;
  const sunEl = series.sunEl[idx] ?? 0;
  const earthAz = series.earthAz[idx] ?? 0;
  const earthEl = series.earthEl[idx] ?? 0;

  const dayTicks = useMemo(() => {
    const perDay = Math.round((24 * MS_PER_HOUR) / series.stepMs);
    const out: Array<{ day: number; az: number; el: number }> = [];
    if (perDay < 1) return out;
    for (let i = 0; i < series.n; i += perDay) {
      out.push({ day: Math.round((i * series.stepMs) / (24 * MS_PER_HOUR)), az: series.sunAz[i], el: series.sunEl[i] });
    }
    return out;
  }, [series]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = panoramaPalette(mode);
    const y = elScale(elDomain, height);
    const pxPerDegX = width / 360;
    const pxPerDegY = height / (hi - lo);
    const X = (az: number) => azToX(az, width, center);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, width, height);

    // Elevation grid: a muted hairline every whole degree (coarser only when the span is very large).
    const gridStep = Math.max(1, Math.ceil((hi - lo) / 24));
    ctx.strokeStyle = pal.hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let e = Math.ceil(lo / gridStep) * gridStep; e <= hi; e += gridStep) {
      const gy = Math.round(y(e)) + 0.5;
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
    }
    ctx.stroke();

    // Terrain in two graphite steps: the full silhouette (far), then the ridge foot (near) eroded inside it,
    // so the true skyline is never raised.
    const cols = Math.ceil(width);
    const azAt = (px: number) => center - 180 + (px / width) * 360;
    const ridge = (erode: number) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let px = 0; px <= cols; px++) {
        const a = azAt(px);
        let e = horizonAt(horizon, a);
        if (erode > 0) {
          for (let d = -erode; d <= erode; d += erode / 2) e = Math.min(e, horizonAt(horizon, a + d));
        }
        ctx.lineTo(px, y(e));
      }
      ctx.lineTo(width, height);
      ctx.closePath();
    };
    ridge(0);
    ctx.fillStyle = pal.far;
    ctx.fill();
    ridge(NEAR_ERODE_DEG);
    ctx.fillStyle = pal.near;
    ctx.fill();
    ctx.beginPath();
    for (let px = 0; px <= cols; px++) {
      const yy = y(horizonAt(horizon, azAt(px)));
      if (px === 0) ctx.moveTo(px, yy);
      else ctx.lineTo(px, yy);
    }
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sun and Earth paths: runs inside the visible band, split where they cross the canvas seam.
    const track = (az: Float32Array, el: Float32Array, color: string, ticks: boolean) => {
      const floor = lo - OFFSCREEN_DEG;
      const runs: AzEl[][] = [];
      let cur: AzEl[] = [];
      for (let i = 0; i < series.n; i++) {
        if (!(el[i] >= floor)) {
          if (cur.length) runs.push(cur);
          cur = [];
        } else cur.push({ az: az[i], el: el[i] });
      }
      if (cur.length) runs.push(cur);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (const run of runs) {
        for (const seg of splitAtWrap(run, center)) {
          ctx.beginPath();
          seg.forEach((p, k) => (k === 0 ? ctx.moveTo(X(p.az), y(p.el)) : ctx.lineTo(X(p.az), y(p.el))));
          ctx.stroke();
        }
      }
      if (ticks) {
        ctx.beginPath();
        for (const t of dayTicks) {
          if (!(t.el >= floor)) continue;
          const tx = Math.round(X(t.az)) + 0.5;
          ctx.moveTo(tx, y(t.el) - TICK_PX);
          ctx.lineTo(tx, y(t.el) + TICK_PX);
        }
        ctx.stroke();
      }
    };
    track(series.earthAz, series.earthEl, pal.earth, false);
    track(series.sunAz, series.sunEl, pal.sun, true);

    // Discs at the cursor: true angular size, stretched by the same factors as the terrain.
    const disc = (az: number, el: number, rDeg: number) => ({
      cx: X(az),
      cy: y(el),
      rx: Math.max(rDeg * pxPerDegX, MIN_DISC_PX),
      ry: Math.max(rDeg * pxPerDegY, MIN_DISC_PX),
    });

    // Earth with its true phase: lit part in the Earth token, unlit part in the deepest surface, hairline rim.
    const e = disc(earthAz, earthEl, earthRDeg);
    const phase = earthPhase(topoAt(sunAz, sunEl, sunRDeg), topoAt(earthAz, earthEl, earthRDeg));
    const f = phase.illuminatedFraction;
    ctx.fillStyle = pal.deepest;
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(e.cx, e.cy);
    ctx.scale(e.rx, e.ry);
    ctx.rotate((phase.brightLimbDeg * Math.PI) / 180);
    ctx.beginPath();
    ctx.arc(0, 0, 1, Math.PI, Math.PI * 2);
    ctx.ellipse(0, 0, 1, Math.abs(1 - 2 * f), 0, 0, Math.PI, f <= 0.5);
    ctx.closePath();
    ctx.fillStyle = pal.earth;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Sun: soft limb that falls off inside the disc edge only. Nothing is drawn outside the disc.
    const s = disc(sunAz, sunEl, sunRDeg);
    ctx.save();
    ctx.translate(s.cx, s.cy);
    ctx.scale(s.rx, s.ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, pal.sun);
    g.addColorStop(0.7, pal.sun);
    g.addColorStop(1, withAlpha(pal.sun, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [width, height, elDomain, lo, hi, center, horizon, series, dayTicks, sunAz, sunEl, earthAz, earthEl, sunRDeg, earthRDeg, mode]);

  // Redraw on any data, size or theme-mode change.
  useEffect(() => {
    draw();
  }, [draw]);

  const onPointerDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { x: ev.clientX, touch: ev.pointerType === "touch" };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.x;
    d.x = ev.clientX;
    // Touch pans the view; mouse and pen drag on the sky scrubs time.
    if (d.touch) setPanAz((p) => p - (dx / Math.max(width, 1)) * 360);
    else if (onScrubTime && dx !== 0) onScrubTime((dx / PX_PER_HOUR) * MS_PER_HOUR);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const summary =
    `Horizon panorama, vertical exaggeration ${exag} times. At the cursor the Sun is at azimuth ${fmt(sunAz)}°, ` +
    `elevation ${fmt(sunEl)}°; Earth is at azimuth ${fmt(earthAz)}°, elevation ${fmt(earthEl)}°.`;

  const y = elScale(elDomain, height);
  const gridStep = Math.max(1, Math.ceil((hi - lo) / 24));
  const gridLabels: number[] = [];
  for (let e = Math.ceil(lo / gridStep) * gridStep; e <= hi; e += gridStep) gridLabels.push(e);

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "relative",
        width: "100%",
        height,
        touchAction: "pan-y",
        cursor: onScrubTime ? "ew-resize" : "default",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={summary}
        style={{ position: "absolute", inset: 0, width: "100%", height }}
      />
      <svg
        role="group"
        aria-label="Compass and scale labels"
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          fontFamily: "var(--font-family-code)",
          fontSize: "var(--font-size-xs)",
          fill: "var(--color-text-muted)",
        }}
      >
        {gridLabels.map((e) => (
          <text key={e} x={LABEL_GAP_PX} y={y(e) - LABEL_GAP_PX} aria-hidden="true">
            {e}°
          </text>
        ))}
        {dayTicks.map((t) =>
          t.el >= lo - OFFSCREEN_DEG ? (
            <text
              key={t.day}
              x={azToX(t.az, width, center)}
              y={y(t.el) - TICK_PX - LABEL_GAP_PX}
              textAnchor="middle"
              aria-hidden="true"
            >
              {`T+${t.day} d`}
            </text>
          ) : null,
        )}
        {COMPASS.map((c) => (
          <text
            key={c.label}
            ref={c.label === "N" ? northRef : undefined}
            x={azToX(c.az, width, center)}
            y={height - LABEL_GAP_PX * 2}
            textAnchor="middle"
            tabIndex={c.label === "N" && pole ? 0 : undefined}
            style={{ fill: "var(--color-text-secondary)", pointerEvents: c.label === "N" && pole ? "auto" : "none" }}
          >
            {c.label}
          </text>
        ))}
        <text x={width - LABEL_GAP_PX} y={height - LABEL_GAP_PX * 2} textAnchor="end">
          {`vertical ×${exag}`}
        </text>
      </svg>
      <Tooltip anchorRef={northRef as never} content={POLE_NORTH} isEnabled={pole} placement="above" />
    </div>
  );
}
