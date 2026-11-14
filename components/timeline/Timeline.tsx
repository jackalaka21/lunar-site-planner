"use client";

import { useId, useMemo } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Circle, Globe, Sun } from "lucide-react";
import { mergeFlickers, type TimeSeries } from "../../lib/engine/sample";
import type { Metrics } from "../../lib/engine/metrics";
import { formatCalendar } from "../ui/MissionClock";
import { formatMet } from "../../lib/format";
import { longestRun, positiveRuns, runs } from "./bands";

export interface TimelineProps {
  series: TimeSeries;
  metrics: Metrics;
  cursorIndex: number;
  axis: "met" | "cal";
  tz?: string;
  /** Flicker merge window (min) so the lanes agree with the metrics. */
  flickerMergeMin: number;
  onSeek: (index: number) => void;
}

const W = 1000;
const GUTTER = 64;
const TRACK = W - GUTTER;
const LANE_H = 18;
const BOTH_H = 24;
const SUN_Y = 14;
const EARTH_Y = 40;
const BOTH_Y = 66;
const BRACKET_Y = 102;
const COMMS_Y = 114;
const H = 124;
const HOUR_MS = 3_600_000;
const ICON = 12;
const INK = "var(--color-text-primary)";
const SUN = "var(--color-data-categorical-orange)";
const EARTH = "var(--color-data-categorical-blue)";
const MUTED = "var(--color-text-muted)";
const RAIL = "var(--color-border)";
const EDGE = "var(--color-border-emphasized)";

const STATION_MIN_W = 12;
const STATION_INITIALS = ["G", "M", "C"] as const;

/** Spans of constant station coverage while Earth is in view; label = initials of covering complexes. */
function stationSpans(bits: Uint8Array, earthIn: Uint8Array): Array<{ start: number; end: number; label: string }> {
  const out: Array<{ start: number; end: number; label: string }> = [];
  let start = 0;
  const m = (i: number) => (earthIn[i] ? bits[i] & 7 : 0);
  for (let i = 1; i <= bits.length; i++) {
    if (i === bits.length || m(i) !== m(start)) {
      const v = m(start);
      if (v) out.push({ start, end: i, label: STATION_INITIALS.filter((_, k) => v & (1 << k)).join("") });
      start = i;
    }
  }
  return out;
}

/** Text for assistive tech, on the same clock as the rest of the card. */
function clockText(series: TimeSeries, i: number, axis: "met" | "cal", tz?: string): string {
  return axis === "met" ? formatMet(i * series.stepMs) : formatCalendar(series.t0Ms + i * series.stepMs, tz);
}

/**
 * Sun / Earth / Both bands over the window. Sun and Earth use flicker-merged states so the three lanes agree
 * (Both is series.both). Keyboard: arrows move 1 h, Page keys 24 h, Home and End jump to the ends.
 * No time text is drawn here; times are shown by the card through MissionClock.
 */
export function Timeline({ series, metrics, cursorIndex, axis, tz, flickerMergeMin, onSeek }: TimelineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = series.n;
  const last = Math.max(1, n - 1);
  const x = (i: number) => GUTTER + (i / last) * TRACK;
  const hourStep = Math.max(1, Math.round(HOUR_MS / series.stepMs));

  const lanes = useMemo(() => {
    const lit = mergeFlickers(series.lit, series.stepMs, flickerMergeMin).merged;
    const ein = mergeFlickers(series.earthIn, series.stepMs, flickerMergeMin).merged;
    return {
      sun: runs(lit).filter((r) => r.value === 1),
      earth: runs(ein).filter((r) => r.value === 1),
      both: runs(series.both).filter((r) => r.value === 1),
      eclipse: positiveRuns(series.eclipseFrac),
      interference: runs(series.interference).filter((r) => r.value === 1),
      comms: longestRun(ein, 0),
      stations: stationSpans(series.dsnBits, series.earthIn),
    };
  }, [series, flickerMergeMin]);

  const dark = useMemo(() => {
    if (metrics.longestDarkStartMs === null || metrics.longestDarkH <= 0) return null;
    const start = Math.round((metrics.longestDarkStartMs - series.t0Ms) / series.stepMs);
    return { start, end: Math.min(n, start + Math.round((metrics.longestDarkH * HOUR_MS) / series.stepMs)) };
  }, [metrics, series, n]);

  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));
  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: -hourStep,
      ArrowRight: hourStep,
      PageDown: -24 * hourStep,
      PageUp: 24 * hourStep,
    };
    if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(n - 1);
    else if (e.key in moves) onSeek(clamp(cursorIndex + moves[e.key]));
    else return;
    e.preventDefault();
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    onSeek(clamp(Math.round(((vx - GUTTER) / TRACK) * last)));
  };

  const bar = (r: { start: number; end: number }, y: number, h: number, fill: string, key: string) => (
    <rect
      key={key}
      x={x(r.start)}
      y={y}
      width={Math.max(0.5, x(r.end - 1) - x(r.start) + TRACK / last)}
      height={h}
      style={{ fill }}
    />
  );
  const dayTicks: number[] = [];
  for (let i = 0; i < n; i += 24 * hourStep) dayTicks.push(i);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="slider"
      tabIndex={0}
      aria-label="Timeline cursor"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={cursorIndex}
      aria-valuetext={clockText(series, cursorIndex, axis, tz)}
      onKeyDown={onKey}
      onPointerDown={onPointer}
      style={{ display: "block", touchAction: "pan-y", cursor: "pointer" }}
      data-testid="timeline"
    >
      <defs>
        <pattern id={`hatch${uid}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" style={{ stroke: MUTED, strokeWidth: 1.5 }} />
        </pattern>
      </defs>
      {[
        { y: SUN_Y, h: LANE_H, label: "Sun", Glyph: Sun, color: SUN },
        { y: EARTH_Y, h: LANE_H, label: "Earth", Glyph: Globe, color: EARTH },
        { y: BOTH_Y, h: BOTH_H, label: "Both", Glyph: Circle, color: INK },
      ].map((l) => (
        <g key={l.label}>
          <rect x={GUTTER} y={l.y} width={TRACK} height={l.h} style={{ fill: RAIL }} />
          <l.Glyph
            x={0}
            y={l.y + (l.h - ICON) / 2}
            width={ICON}
            height={ICON}
            style={{ stroke: l.color, fill: l.label === "Both" ? INK : "none" }}
          />
          <text x={ICON + 6} y={l.y + l.h / 2 + 4} style={{ fill: "var(--color-text-secondary)", fontSize: 11 }}>
            {l.label}
          </text>
        </g>
      ))}
      {lanes.sun.map((r, k) => bar(r, SUN_Y, LANE_H, SUN, `s${k}`))}
      {lanes.earth.map((r, k) => bar(r, EARTH_Y, LANE_H, EARTH, `e${k}`))}
      {lanes.both.map((r, k) => bar(r, BOTH_Y, BOTH_H, INK, `b${k}`))}
      {lanes.stations.map((r) =>
        (r.end - r.start) * (TRACK / last) >= STATION_MIN_W ? (
          <text
            key={`d${r.start}`}
            data-testid="dsn-station"
            x={(x(r.start) + x(r.end - 1) + TRACK / last) / 2}
            y={EARTH_Y + LANE_H / 2 + 4}
            textAnchor="middle"
            style={{ fill: MUTED, fontSize: 10, fontFamily: "var(--font-family-code)", pointerEvents: "none" }}
          >
            {r.label}
          </text>
        ) : null,
      )}
      {lanes.interference.map((r, k) => bar(r, EARTH_Y, LANE_H, `url(#hatch${uid})`, `i${k}`))}
      {lanes.eclipse.map((r, k) => bar(r, SUN_Y - 8, 6, EDGE, `x${k}`))}
      {dayTicks.map((i) => (
        <line key={i} x1={x(i)} x2={x(i)} y1={BOTH_Y + BOTH_H} y2={BOTH_Y + BOTH_H + 4} style={{ stroke: EDGE }} />
      ))}
      {dark && <Bracket x1={x(dark.start)} x2={x(dark.end - 1)} y={BRACKET_Y} />}
      {lanes.comms && <Bracket x1={x(lanes.comms.start)} x2={x(lanes.comms.end - 1)} y={COMMS_Y} />}
      <line x1={x(0)} x2={x(0)} y1={0} y2={BOTH_Y + BOTH_H} style={{ stroke: EDGE, strokeDasharray: "2 2" }} />
      <line
        x1={x(cursorIndex)}
        x2={x(cursorIndex)}
        y1={0}
        y2={BRACKET_Y - 4}
        style={{ stroke: INK, strokeWidth: 1.5 }}
      />
    </svg>
  );
}

function Bracket({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <path d={`M${x1} ${y - 4} V${y} H${x2} V${y - 4}`} style={{ stroke: MUTED, fill: "none", strokeWidth: 1.5 }} />;
}
