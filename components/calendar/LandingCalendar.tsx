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
const CELL = 16;
const GAP = 6;
const PITCH = CELL + GAP;
const RADIUS = 4;
const LABEL_H = 24;
const GRID_H = 7 * PITCH - GAP;
const HALF_H = LABEL_H + GRID_H;
const HALF_GAP = 28;
const PAD_L = 44;
const COLS = 28;
const W = PAD_L + COLS * PITCH - GAP;
const H = 2 * HALF_H + HALF_GAP;
const WEEKDAY_ROWS: Array<[number, string]> = [
  [0, "Mon"],
  [2, "Wed"],
  [4, "Fri"],
];
const GRAPH_TOP = 24;
const GRAPH_PLOT_H = 160;
const GRAPH_H = GRAPH_TOP + GRAPH_PLOT_H + 44;
const MIN_W = "36rem";
const BEST_COUNT = 10;
const INK = "var(--color-text-primary)";
const MUTED = "var(--color-text-muted)";
const HAIR = "var(--color-border)";
const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FOOTNOTE =
  "Good windows drift ~2.3 days earlier each month and the pattern repeats about every 346.6 days (Earth's 27.2-day wobble vs the Sun's 29.5-day circuit).";
const SUBSOLAR_CAPTION =
  "Sub-solar latitude: how far north (+) or south (−) of the lunar equator the Sun is overhead. When it is negative the Sun is over the southern hemisphere, so south-pole sites get more sunlight (lunar southern summer).";
export const NO_GOOD_TITLE = "No Good landing in the next 365 days at this site";

/** Step 0 is the deepest surface, step 4 the primary ink; the three between are mixes of the two. */
const stepFill = (step: number) =>
  `color-mix(in srgb, ${INK} ${(step * 100) / (RAMP_STEPS - 1)}%, var(--surface-deepest))`;

function fmtDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Landing calendar: a 365 day heatmap in two half-year rows (Monday-first week columns), then a sub-solar
 * latitude graph with month and degree axes. Pointer and keyboard drive one focus ring (arrows 1 and 7 days, Home and End, Enter picks).
 * The best days are also listed as ordinary buttons for touch and assistive tech.
 */
export function LandingCalendar(p: LandingCalendarProps) {
  const { fromMs, days, subsolarDeg, siteLat, durationDays, t0Ms } = p;
  const uid = useId();
  const windowH = durationDays * 24;
  // Two halves of six months each, every one a Monday-first week grid of its own.
  const geo = useMemo(() => {
    const d0 = new Date(fromMs);
    const split = Math.round((Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 6, 1) - fromMs) / DAY_MS);
    const wd = [0, 1].map((h) => (new Date(fromMs + (h ? split : 0) * DAY_MS).getUTCDay() + 6) % 7);
    return { split, wd };
  }, [fromMs]);
  const halfOf = (k: number) => (k < geo.split ? 0 : 1);
  const posOf = (k: number) => {
    const h = halfOf(k);
    const n = k - (h ? geo.split : 0) + geo.wd[h];
    return { h, col: Math.floor(n / 7), row: n % 7 };
  };
  const cellX = (k: number) => PAD_L + posOf(k).col * PITCH;
  const cellY = (k: number) => {
    const q = posOf(k);
    return q.h * (HALF_H + HALF_GAP) + LABEL_H + q.row * PITCH;
  };

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
    const x = ((e.clientX - box.left) / box.width) * W - PAD_L;
    const yAll = ((e.clientY - box.top) / box.height) * H;
    const h = yAll >= HALF_H + HALF_GAP / 2 ? 1 : 0;
    const y = yAll - h * (HALF_H + HALF_GAP) - LABEL_H;
    const c = Math.floor(x / PITCH);
    const r = Math.floor(y / PITCH);
    if (r < 0 || r > 6 || c < 0) return null;
    const k = c * 7 + r - geo.wd[h] + (h ? geo.split : 0);
    return k >= 0 && k <= lastIndex && halfOf(k) === h ? k : null;
  };

  const monthLabels = useMemo(() => {
    const out: Array<{ k: number; x: number; y: number; text: string; year?: string }> = [];
    for (let k = 0; k < CAL_DAYS; k++) {
      const d = new Date(fromMs + k * DAY_MS);
      if (d.getUTCDate() !== 1) continue;
      const h = k < geo.split ? 0 : 1;
      const n = k - (h ? geo.split : 0) + geo.wd[h];
      out.push({
        k,
        x: PAD_L + Math.floor(n / 7) * PITCH,
        y: h * (HALF_H + HALF_GAP) + 14,
        text: MONTHS[d.getUTCMonth()],
        year: out.length === 0 || d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : undefined,
      });
    }
    return out;
  }, [fromMs, geo]);

  // Sub-solar latitude graph: full width under both halves, one point per day. The range comes from the data.
  const graph = useMemo(() => {
    if (!subsolarDeg || subsolarDeg.length < 2) return null;
    const maxAbs = Math.max(0.1, ...subsolarDeg.map((v) => Math.abs(v)));
    const lim = maxAbs * 1.25;
    const tick = Math.floor(maxAbs * 2) / 2 || Math.round(maxAbs * 10) / 10;
    const n = subsolarDeg.length - 1;
    const x0 = PAD_L;
    const x1 = W - 6;
    const px = (k: number) => x0 + (k / n) * (x1 - x0);
    const mid = GRAPH_TOP + GRAPH_PLOT_H / 2;
    const py = (v: number) => mid - (v / lim) * (GRAPH_PLOT_H / 2);
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
      const edge = x < x0 + 56 ? "start" : x > x1 - 56 ? "end" : "middle";
      return { x, y: py(subsolarDeg[k]) + (above ? -10 : 18), text, edge: edge as "start" | "middle" | "end" };
    };
    const fmtTick = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${Math.abs(v).toFixed(1).replace(/\.0$/, "")}°`;
    const months = monthLabels.map((m, i) => {
      const next = monthLabels[i + 1]?.k ?? CAL_DAYS;
      return { ...m, gx: px(m.k), cx: px((m.k + next) / 2) };
    });
    return {
      path,
      px,
      py,
      x0,
      x1,
      mid,
      months,
      ticks: [tick, 0, -tick].map((v) => ({ v, y: py(v), text: fmtTick(v) })),
      marks: [
        mark(hi, north ? "Lunar summer" : "Lunar winter", true),
        mark(lo, north ? "Lunar winter" : "Lunar summer", false),
      ],
    };
  }, [subsolarDeg, siteLat, monthLabels]);

  const anchorAt = shown !== null && byIndex.has(shown) ? { left: cellX(shown), top: cellY(shown) } : null;
  const landingK = t0Index >= 0 && t0Index < CAL_DAYS ? t0Index : null;
  const north = siteLat >= 0;

  return (
    <VStack gap={8}>
      {!hasGood && days.length > 0 ? (
        <EmptyState
          isCompact
          title={NO_GOOD_TITLE}
          description="Try a different site, or relax the Good thresholds in Settings."
        />
      ) : null}

      <div style={{ overflowX: "auto", width: "100%" }}>
        <div style={{ position: "relative", minWidth: MIN_W }}>
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
            {[0, 1].map((h) =>
              WEEKDAY_ROWS.map(([r, label]) => (
                <text
                  key={`${h}-${label}`}
                  x={0}
                  y={h * (HALF_H + HALF_GAP) + LABEL_H + r * PITCH + CELL - 3}
                  style={{ fill: MUTED, fontSize: 11 }}
                >
                  {label}
                </text>
              )),
            )}
            {monthLabels.map((m) => (
              <text key={m.k} x={m.x} y={m.y} style={{ fill: MUTED, fontSize: 12 }}>
                {m.year ? `${m.text} ${m.year}` : m.text}
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
                  style={{ fill: stepFill(step), stroke: isT0 ? INK : "none", strokeWidth: isT0 ? 2 : 0 }}
                />
              );
            })}
            {focused && byIndex.has(focus) ? (
              <rect
                data-testid="cal-focus"
                x={cellX(focus) - 3}
                y={cellY(focus) - 3}
                width={CELL + 6}
                height={CELL + 6}
                rx={RADIUS + 1}
                style={{ fill: "none", stroke: INK, strokeWidth: 2, pointerEvents: "none" }}
              />
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

      <VStack gap={3}>
        <Text type="label" weight="medium">
          Sub-solar latitude through the year
        </Text>
        <Text type="supporting" size="sm">
          {SUBSOLAR_CAPTION}{" "}
          {north
            ? "This site is in the north, so its summer is when the line is above 0."
            : "This site is in the south, so its summer is when the line is below 0."}
        </Text>
        {graph ? (
          <div style={{ overflowX: "auto", width: "100%" }}>
            <svg
              viewBox={`0 0 ${W} ${GRAPH_H}`}
              width="100%"
              role="img"
              aria-label="Sub-solar latitude in degrees by month across the 365 days, with the landing date marked."
              data-testid="subsolar-graph"
              style={{ display: "block", minWidth: MIN_W }}
            >
              <text
                transform={`translate(11 ${graph.mid}) rotate(-90)`}
                textAnchor="middle"
                style={{ fill: MUTED, fontSize: 11 }}
              >
                Sub-solar latitude
              </text>
              {graph.months.map((m) => (
                <line
                  key={`g${m.k}`}
                  x1={m.gx}
                  x2={m.gx}
                  y1={GRAPH_TOP}
                  y2={GRAPH_TOP + GRAPH_PLOT_H}
                  style={{ stroke: HAIR, strokeWidth: 1, opacity: 0.5 }}
                />
              ))}
              {graph.ticks.map((t) => (
                <g key={t.text}>
                  <line
                    x1={graph.x0}
                    x2={graph.x1}
                    y1={t.y}
                    y2={t.y}
                    style={{
                      stroke: HAIR,
                      strokeWidth: t.v === 0 ? 1.5 : 1,
                      strokeDasharray: t.v === 0 ? undefined : "3 4",
                    }}
                  />
                  <text x={graph.x0 - 6} y={t.y + 4} textAnchor="end" style={{ fill: MUTED, fontSize: 11 }}>
                    {t.text}
                  </text>
                </g>
              ))}
              <text x={graph.x1} y={graph.mid - 6} textAnchor="end" style={{ fill: MUTED, fontSize: 10 }}>
                equator
              </text>
              {graph.months.map((m) => (
                <g key={`m${m.k}`}>
                  <text
                    x={m.cx}
                    y={GRAPH_TOP + GRAPH_PLOT_H + 18}
                    textAnchor="middle"
                    style={{ fill: MUTED, fontSize: 11 }}
                  >
                    {m.text}
                  </text>
                  {m.year ? (
                    <text
                      x={m.cx}
                      y={GRAPH_TOP + GRAPH_PLOT_H + 33}
                      textAnchor="middle"
                      style={{ fill: MUTED, fontSize: 10 }}
                    >
                      {m.year}
                    </text>
                  ) : null}
                </g>
              ))}
              <path d={graph.path} style={{ fill: "none", stroke: INK, strokeWidth: 2 }} />
              {landingK !== null ? (
                <g data-testid="subsolar-landing">
                  <line
                    x1={graph.px(landingK)}
                    x2={graph.px(landingK)}
                    y1={GRAPH_TOP - 6}
                    y2={GRAPH_TOP + GRAPH_PLOT_H}
                    style={{ stroke: "var(--color-data-categorical-orange)", strokeWidth: 1.5 }}
                  />
                  <text
                    x={graph.px(landingK)}
                    y={GRAPH_TOP - 10}
                    textAnchor={graph.px(landingK) > graph.x1 - 40 ? "end" : "middle"}
                    style={{ fill: INK, fontSize: 11 }}
                  >
                    Landing
                  </text>
                </g>
              ) : null}
              {graph.marks.map((m) => (
                <text key={m.text} x={m.x} y={m.y} textAnchor={m.edge} style={{ fill: INK, fontSize: 11 }}>
                  {m.text}
                </text>
              ))}
            </svg>
          </div>
        ) : null}
      </VStack>

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
