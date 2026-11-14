"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { VStack } from "@astryxdesign/core/VStack";
import type { DaySummary } from "../../lib/engine";
import {
  bestDays,
  CAL_DAYS,
  keepTimeOfDay,
  rampLegend,
  rampStep,
  RAMP_STEPS,
  VERDICT_LABEL,
} from "./calendarModel";

export interface LandingCalendarProps {
  /** 00:00 UTC on the 1st of the landing month: day 0 of the 365. */
  fromMs: number;
  days: DaySummary[];
  /** Sub-solar latitude (deg) per day, same indexing as the days. Null while it loads. */
  subsolarDeg: number[] | null;
  siteLat: number;
  durationDays: number;
  /** Current landing instant; its time of day is kept when a day is picked. */
  t0Ms: number;
  onSelect: (t0Ms: number) => void;
}

const DAY_MS = 86_400_000;
const CELL = 12;
const GAP = 4;
const PITCH = CELL + GAP;
const RADIUS = 3;
const LABEL_H = 20;
const GRID_Y = LABEL_H;
const GRID_H = 7 * PITCH - GAP;
const STRIP_Y = GRID_Y + GRID_H + 24;
const STRIP_H = 56;
const LAT_MAX = 1.6;
const H = STRIP_Y + STRIP_H + 28;
const BEST_COUNT = 10;
const INK = "var(--color-text-primary)";
const MUTED = "var(--color-text-muted)";
const HAIR = "var(--color-border)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FOOTNOTE =
  "Good windows drift ~2.3 days earlier each month and the pattern repeats about every 346.6 days (Earth's 27.2-day wobble vs the Sun's 29.5-day circuit).";
export const NO_GOOD_TITLE = "No Good landing in the next 365 days at this site";

/** Step 0 is the deepest surface, step 4 the primary ink; the three between are mixes of the two. */
const stepFill = (step: number) =>
  `color-mix(in srgb, ${INK} ${(step * 100) / (RAMP_STEPS - 1)}%, var(--surface-deepest))`;

function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Landing calendar: a 365 day heatmap in a single SVG (7 rows by weeks) with a sub-solar latitude strip
 * beneath it. Pointer and keyboard drive one focus ring (arrows 1 and 7 days, Home and End, Enter picks).
 * The best days are also listed as ordinary buttons for touch and assistive tech.
 */
export function LandingCalendar(p: LandingCalendarProps) {
  const { fromMs, days, subsolarDeg, siteLat, durationDays, t0Ms } = p;
  const uid = useId();
  const windowH = durationDays * 24;
  const startWd = (new Date(fromMs).getUTCDay() + 6) % 7; // Monday first
  const colOf = (k: number) => Math.floor((k + startWd) / 7);
  const rowOf = (k: number) => (k + startWd) % 7;
  const cols = colOf(CAL_DAYS - 1) + 1;
  const W = cols * PITCH - GAP;
  const cellX = (k: number) => colOf(k) * PITCH;
  const cellY = (k: number) => GRID_Y + rowOf(k) * PITCH;

  const byIndex = useMemo(() => {
    const m = new Map<number, DaySummary>();
    for (const d of days) m.set(Math.round((d.t0Ms - fromMs) / DAY_MS), d);
    return m;
  }, [days, fromMs]);
  const lastIndex = useMemo(() => Math.max(0, ...byIndex.keys()), [byIndex]);

  const t0Index = Math.round((t0Ms - fromMs) / DAY_MS);
  const [focus, setFocus] = useState(Math.min(lastIndex, Math.max(0, t0Index)));
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const hasGood = days.some((d) => d.verdict === "good");
  const best = useMemo(() => bestDays(days, BEST_COUNT), [days]);
  const legend = rampLegend(windowH);

  const shown = hover ?? (focused ? focus : null);
  const shownDay = shown !== null ? byIndex.get(shown) : undefined;
  const readout = shownDay
    ? `${fmtDay(shownDay.t0Ms)}: ${VERDICT_LABEL[shownDay.verdict]}, ${Math.round(shownDay.bothH)} h with Sun and Earth`
    : "";

  const select = (k: number) => {
    const d = byIndex.get(k);
    if (d) p.onSelect(keepTimeOfDay(d.t0Ms, t0Ms));
  };
  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in moves) setFocus((f) => Math.max(0, Math.min(lastIndex, f + moves[e.key])));
    else if (e.key === "Home") setFocus(0);
    else if (e.key === "End") setFocus(lastIndex);
    else if (e.key === "Enter" || e.key === " ") select(focus);
    else return;
    e.preventDefault();
  };
  const indexAt = (e: PointerEvent<SVGSVGElement>): number | null => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return null;
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H - GRID_Y;
    const c = Math.floor(x / PITCH);
    const r = Math.floor(y / PITCH);
    if (r < 0 || r > 6 || c < 0) return null;
    const k = c * 7 + r - startWd;
    return k >= 0 && k <= lastIndex ? k : null;
  };

  const monthLabels = useMemo(() => {
    const out: Array<{ x: number; text: string }> = [];
    for (let k = 0; k < CAL_DAYS; k++) {
      const d = new Date(fromMs + k * DAY_MS);
      if (d.getUTCDate() !== 1) continue;
      const m = MONTHS[d.getUTCMonth()];
      const withYear = out.length === 0 || d.getUTCMonth() === 0;
      out.push({ x: Math.floor((k + startWd) / 7) * PITCH, text: withYear ? `${m} ${d.getUTCFullYear()}` : m });
    }
    return out;
  }, [fromMs, startWd]);

  // Season overlay: sub-solar latitude by day. A hemisphere's summer is when the Sun is over it.
  const season = useMemo(() => {
    if (!subsolarDeg || subsolarDeg.length < 2) return null;
    const px = (k: number) => Math.floor((k + startWd) / 7) * PITCH + CELL / 2;
    const py = (v: number) => STRIP_Y + STRIP_H / 2 - (v / LAT_MAX) * (STRIP_H / 2);
    const path = subsolarDeg.map((v, k) => `${k === 0 ? "M" : "L"}${px(k).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
    let hi = 0;
    let lo = 0;
    subsolarDeg.forEach((v, k) => {
      if (v > subsolarDeg[hi]) hi = k;
      if (v < subsolarDeg[lo]) lo = k;
    });
    const north = siteLat >= 0;
    const mark = (k: number, text: string, above: boolean) => {
      const x = px(k);
      const edge = x < 56 ? "start" : x > W - 56 ? "end" : "middle";
      return { x, y: py(subsolarDeg[k]) + (above ? -8 : 16), text, edge: edge as "start" | "middle" | "end" };
    };
    return {
      path,
      marks: [
        mark(hi, north ? "Lunar summer" : "Lunar winter", true),
        mark(lo, north ? "Lunar winter" : "Lunar summer", false),
      ],
    };
  }, [subsolarDeg, siteLat, startWd, W]);

  const anchorAt = shown !== null && byIndex.has(shown) ? { left: cellX(shown), top: cellY(shown) } : null;

  return (
    <VStack gap={4}>
      {!hasGood && days.length > 0 ? (
        <EmptyState
          isCompact
          title={NO_GOOD_TITLE}
          description="Try a different site, or relax the Good thresholds in Settings."
        />
      ) : null}

      <div style={{ position: "relative", width: "100%" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="group"
          tabIndex={0}
          aria-label="Landing calendar, 365 days. Arrow keys move one day or one week, Enter sets the landing date."
          aria-describedby={`${uid}-readout`}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerMove={(e) => setHover(indexAt(e))}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const k = indexAt(e);
            if (k !== null) setFocus(k);
          }}
          style={{ display: "block", touchAction: "manipulation", outline: "none", cursor: "pointer" }}
          data-testid="landing-calendar"
        >
          {monthLabels.map((m) => (
            <text key={m.text + m.x} x={m.x} y={12} style={{ fill: MUTED, fontSize: 11 }}>
              {m.text}
            </text>
          ))}
          {Array.from({ length: CAL_DAYS }, (_, k) => {
            const d = byIndex.get(k);
            if (!d) return null;
            const step = rampStep(d.bothH, windowH);
            const isT0 = k === t0Index;
            return (
              <rect
                key={k}
                data-testid={`cal-cell-${k}`}
                data-step={step}
                data-verdict={d.verdict}
                x={cellX(k)}
                y={cellY(k)}
                width={CELL}
                height={CELL}
                rx={RADIUS}
                onClick={() => {
                  setFocus(k);
                  select(k);
                }}
                style={{ fill: stepFill(step), stroke: isT0 ? INK : "none", strokeWidth: isT0 ? 1.5 : 0 }}
              />
            );
          })}
          {focused && byIndex.has(focus) ? (
            <rect
              data-testid="cal-focus"
              x={cellX(focus) - 2}
              y={cellY(focus) - 2}
              width={CELL + 4}
              height={CELL + 4}
              rx={RADIUS + 1}
              style={{ fill: "none", stroke: INK, strokeWidth: 2, pointerEvents: "none" }}
            />
          ) : null}

          <text x={0} y={STRIP_Y - 8} style={{ fill: MUTED, fontSize: 11 }}>
            Sub-solar latitude, equator line in the middle
          </text>
          <line
            x1={0}
            x2={W}
            y1={STRIP_Y + STRIP_H / 2}
            y2={STRIP_Y + STRIP_H / 2}
            style={{ stroke: HAIR, strokeWidth: 1 }}
          />
          {season ? (
            <>
              <path d={season.path} style={{ fill: "none", stroke: INK, strokeWidth: 1.5 }} />
              {season.marks.map((m) => (
                <text key={m.text} x={m.x} y={m.y} textAnchor={m.edge} style={{ fill: MUTED, fontSize: 11 }}>
                  {m.text}
                </text>
              ))}
            </>
          ) : null}
        </svg>
        <div
          ref={anchorRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: anchorAt ? `${(anchorAt.left / W) * 100}%` : 0,
            top: anchorAt ? `${(anchorAt.top / H) * 100}%` : 0,
            width: `${(CELL / W) * 100}%`,
            height: `${(CELL / H) * 100}%`,
          }}
        />
        <Tooltip anchorRef={anchorRef} isOpen={readout.length > 0} placement="above" content={readout} />
      </div>

      <div id={`${uid}-readout`} role="status" aria-live="polite" style={{ minHeight: "1.5em" }}>
        <Text type="code" hasTabularNumbers size="xsm">
          {readout || " "}
        </Text>
      </div>

      <div
        role="group"
        aria-label="Legend: hours of Sun and Earth together"
        style={{ display: "flex", gap: GAP * 3, alignItems: "center", flexWrap: "wrap" }}
      >
        <Text type="supporting" size="xsm">
          Sun and Earth together, h
        </Text>
        {legend.map((label, i) => (
          <div key={label} data-testid={`cal-legend-${i}`} style={{ display: "flex", gap: GAP, alignItems: "center" }}>
            <svg width={CELL} height={CELL} aria-hidden="true">
              <rect width={CELL} height={CELL} rx={RADIUS} style={{ fill: stepFill(i) }} />
            </svg>
            <Text type="code" size="xsm" color="secondary">
              {label}
            </Text>
          </div>
        ))}
      </div>

      <Text type="supporting" size="sm">
        {FOOTNOTE}
      </Text>

      <VStack gap={1}>
        <Text type="label" weight="medium">
          Best days
        </Text>
        <ul aria-label="Best days" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {best.map((d) => (
            <li key={d.t0Ms}>
              <Button
                label={`${fmtDay(d.t0Ms)}, ${Math.round(d.bothH)} h, ${VERDICT_LABEL[d.verdict]}`}
                variant="ghost"
                size="lg"
                onClick={() => p.onSelect(keepTimeOfDay(d.t0Ms, t0Ms))}
              />
            </li>
          ))}
        </ul>
      </VStack>
    </VStack>
  );
}
