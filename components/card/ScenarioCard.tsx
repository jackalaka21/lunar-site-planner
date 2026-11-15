"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Stack } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import type { EventKind } from "../../lib/engine/events";
import { fmtHours } from "../../lib/engine/format";
import { horizonAt } from "../../lib/engine/horizon";
import type { Metrics } from "../../lib/engine/metrics";
import type { RobustnessResult } from "../../lib/engine/robustness";
import { mergeFlickers, type TimeSeries } from "../../lib/engine/sample";
import type { SiteContext } from "../../lib/engine/types";
import {
  CONTROLS_RESERVE_REM,
  PHONE_BREAKPOINT_REM,
  VIEWPORT_HEIGHT_REM,
} from "../terrain3d/viewport";
import { HorizonPanorama } from "../panorama/HorizonPanorama";
import { Timeline } from "../timeline/Timeline";
import { MissionClock } from "../ui/MissionClock";
import { Term } from "../ui/Term";
import { MetricsBar } from "./MetricsBar";
import { NextGood } from "./NextGood";
import { Provenance } from "./Provenance";
import { SecondaryMetrics } from "./SecondaryMetrics";
import { VerdictChip } from "./VerdictChip";
import { formatDelta, formatSpan } from "./delta";

/** Same reserve as StaticDefaultCard's placeholder, so the three.js chunk loading causes no layout jump. */
const loadingCss =
  `[data-testid="terrain-loading"]{height:${VIEWPORT_HEIGHT_REM.single + CONTROLS_RESERVE_REM.desktop}rem}` +
  `@media (max-width: ${PHONE_BREAKPOINT_REM}rem){[data-testid="terrain-loading"]{height:${VIEWPORT_HEIGHT_REM.phone + CONTROLS_RESERVE_REM.phone}rem}}`;
function TerrainLoading() {
  return (
    <>
      <style>{loadingCss}</style>
      <Stack aria-hidden="true" data-testid="terrain-loading" width="100%" />
    </>
  );
}

const LunarTerrain3D = dynamic(
  () => import("../terrain3d/LunarTerrain3D").then((m) => m.LunarTerrain3D),
  { ssr: false, loading: () => <TerrainLoading /> },
);

export interface ScenarioCardProps {
  scenario: {
    key: string;
    name: string;
    groupTag?: string;
    /** Catalogue site id when the scenario is a catalogue site (not a custom point). */
    siteId?: string;
    lat: number;
    lon: number;
    t0Ms: number;
  };
  result: { ctx: SiteContext; series: TimeSeries; metrics: Metrics };
  cursorIndex: number;
  axis: "met" | "cal";
  tz?: string;
  elDomain: [number, number];
  centerAz?: number;
  flickerMergeMin: number;
  /** Absolute UTC ms of each next event after the window start, or null when none within 60 d. */
  countdowns: Record<EventKind, number | null>;
  /** Differences in hours against scenario A. Cards 2 to 4 only. */
  deltaVsA?: { bothH: number; sunlitH: number; longestDarkH: number };
  robust?: RobustnessResult;
  /** Landing ellipse radius in km (settings), drawn draped on the 3D terrain. */
  ellipseKm?: number;
  onSeek: (index: number) => void;
  onScrubTime?: (deltaMs: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}

const POLE_LAT = 89.9;
const NONE_WITHIN = "> 60 d";
const PENDING = "…";

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
function compassDir(azDeg: number): string {
  const norm = ((azDeg % 360) + 360) % 360;
  return COMPASS_8[Math.round(norm / 45) % 8];
}

export function ScenarioCard(p: ScenarioCardProps) {
  const { scenario, result, cursorIndex, axis, tz, countdowns, deltaVsA, robust } = p;
  const { ctx, series, metrics } = result;
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const letter = scenario.key.toUpperCase();
  const idx = Math.max(0, Math.min(series.n - 1, cursorIndex));
  const cursorMs = series.t0Ms + idx * series.stepMs;

  const merged = useMemo(
    () => ({
      lit: mergeFlickers(series.lit, series.stepMs, p.flickerMergeMin).merged,
      earth: mergeFlickers(series.earthIn, series.stepMs, p.flickerMergeMin).merged,
    }),
    [series, p.flickerMergeMin],
  );

  // Next transition AFTER the cursor, from this card's merged series (R18); past the window, the prop (R24).
  const nextInWindow = (state: Uint8Array): number | null => {
    for (let i = idx + 1; i < series.n; i++)
      if (state[i] !== state[idx]) return series.t0Ms + i * series.stepMs;
    return null;
  };
  const countdown = (state: Uint8Array, fallback: number | null | undefined) => {
    const inWindow = nextInWindow(state);
    if (inWindow !== null) return formatSpan(inWindow - cursorMs);
    if (fallback === null) return NONE_WITHIN;
    if (fallback === undefined || fallback <= cursorMs) return PENDING;
    return formatSpan(fallback - cursorMs);
  };
  const sunLit = merged.lit[idx] === 1;
  const earthUp = merged.earth[idx] === 1;
  const sunValue = countdown(merged.lit, sunLit ? countdowns.sunset : countdowns.sunrise);
  const earthNever = metrics.earthH === 0;
  const earthValue = countdown(merged.earth, earthUp ? countdowns.earthset : countdowns.earthrise);

  const sunAzNow = series.sunAz[idx] ?? 0;
  const sunElNow = series.sunEl[idx] ?? 0;
  const earthAzNow = series.earthAz[idx] ?? 0;
  const earthElNow = series.earthEl[idx] ?? 0;
  const sunRidgeDeg = horizonAt(ctx.horizon, sunAzNow);
  const earthRidgeDeg = horizonAt(ctx.horizon, earthAzNow);

  const sunPlainStatus = sunLit
    ? `Solar power active: Sun is ${sunElNow.toFixed(1)}° in the ${compassDir(sunAzNow)} (ridge ${sunRidgeDeg.toFixed(1)}°)`
    : `In darkness: Sun (${sunElNow.toFixed(1)}°) blocked by ${sunRidgeDeg.toFixed(1)}° ridge to the ${compassDir(sunAzNow)}`;
  const earthPlainStatus = earthUp
    ? `Earth radio open: ${earthElNow.toFixed(1)}° in the ${compassDir(earthAzNow)} (ridge ${earthRidgeDeg.toFixed(1)}°)`
    : `Earth link blocked: (${earthElNow.toFixed(1)}°) behind ${earthRidgeDeg.toFixed(1)}° ridge to the ${compassDir(earthAzNow)}`;

  return (
    <Card padding={5} data-testid={`scenario-card-${scenario.key}`}>
      <VStack gap={5}>
        <VStack gap={5} data-tour-id="tour-metrics">
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={0.5}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Token label={letter} size="sm" color="gray" description={`Scenario ${letter}`} />
                <Text type="label" weight="medium">
                  {scenario.name}
                </Text>
                {scenario.groupTag && <Text type="supporting">{scenario.groupTag}</Text>}
              </HStack>
              <HStack gap={1.5} vAlign="center" wrap="wrap">
                <Text type="supporting" size="xsm">
                  Landing
                </Text>
                <MissionClock ms={scenario.t0Ms} axis="cal" tz={tz} />
                <Text type="supporting" size="xsm">
                  Cursor
                </Text>
                <MissionClock
                  ms={axis === "met" ? idx * series.stepMs : cursorMs}
                  axis={axis}
                  tz={tz}
                />
              </HStack>
            </VStack>
            <HStack gap={1} vAlign="center">
              <VerdictChip verdict={metrics.verdict} reason={metrics.reason} />
              <IconButton
                label={`Edit scenario ${letter}`}
                tooltip="Edit"
                variant="ghost"
                size="lg"
                icon={<Icon icon={Pencil} />}
                onClick={p.onEdit}
              />
              <IconButton
                label={`Remove scenario ${letter}`}
                tooltip="Remove"
                variant="ghost"
                size="lg"
                icon={<Icon icon={X} />}
                onClick={p.onRemove}
              />
            </HStack>
          </HStack>

          <MetricsBar
            both={fmtHours(metrics.bothH)}
            bothDelta={deltaVsA ? formatDelta(deltaVsA.bothH) : undefined}
            robust={robust ? { ...robust.bothH, points: robust.points } : undefined}
            sun={{
              label: (
                <Term id={sunLit ? "sunset" : "sunrise"}>
                  {sunLit ? "Sunset in" : "Sunrise in"}
                </Term>
              ),
              value: sunValue,
            }}
            earth={
              earthNever
                ? { value: "Earth never in view" }
                : {
                    label: (
                      <Term id={earthUp ? "earthset" : "earthrise"}>
                        {earthUp ? "Earthset in" : "Earthrise in"}
                      </Term>
                    ),
                    value: earthValue,
                  }
            }
            sunEl={{
              label: <Term id="elevation">Sun elevation now</Term>,
              value: `${sunElNow.toFixed(1)}°`,
            }}
          />
        </VStack>

        <VStack gap={2}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={3} vAlign="center" wrap="wrap">
              <HStack gap={1.5} vAlign="center">
                <StatusDot
                  variant={sunLit ? "success" : "error"}
                  label={sunLit ? "Sun visible" : "Sun blocked"}
                />
                <Text type="supporting" size="xsm">
                  {sunPlainStatus}
                </Text>
              </HStack>
              <HStack gap={1.5} vAlign="center">
                <StatusDot
                  variant={earthUp ? "success" : "error"}
                  label={earthUp ? "Earth visible" : "Earth blocked"}
                />
                <Text type="supporting" size="xsm">
                  {earthPlainStatus}
                </Text>
              </HStack>
            </HStack>
            <HStack data-tour-id="tour-view-toggle">
              <SegmentedControl
                label="Terrain view mode"
                size="lg"
                value={viewMode}
                onChange={(v) => setViewMode(v === "3d" ? "3d" : "2d")}
              >
                <SegmentedControlItem value="2d" label="2D skyline" />
                <SegmentedControlItem value="3d" label="3D terrain" />
              </SegmentedControl>
            </HStack>
          </HStack>

          <VStack data-tour-id="tour-3d-terrain">
            {viewMode === "3d" ? (
              <LunarTerrain3D
                horizon={ctx.horizon}
                series={series}
                cursorIndex={idx}
                lat={scenario.lat}
                lon={scenario.lon}
                siteId={scenario.siteId}
                obsHeightM={ctx.obsHeightM}
                ellipseKm={p.ellipseKm}
                pole={Math.abs(scenario.lat) >= POLE_LAT}
                onScrubTime={p.onScrubTime}
              />
            ) : (
              <HorizonPanorama
                horizon={ctx.horizon}
                series={series}
                cursorIndex={idx}
                elDomain={p.elDomain}
                centerAz={p.centerAz}
                onScrubTime={p.onScrubTime}
                pole={Math.abs(scenario.lat) >= POLE_LAT}
              />
            )}
          </VStack>
        </VStack>

        <VStack data-tour-id="tour-timeline">
          <Timeline
            series={series}
            metrics={metrics}
            cursorIndex={idx}
            axis={axis}
            tz={tz}
            flickerMergeMin={p.flickerMergeMin}
            onSeek={p.onSeek}
          />
        </VStack>

        <VStack data-tour-id="tour-validation">
          <Provenance ctx={ctx} />
        </VStack>

        <SecondaryMetrics
          scenarioName={scenario.name}
          t0Ms={scenario.t0Ms}
          metrics={metrics}
          series={series}
          cursorIndex={idx}
          axis={axis}
          tz={tz}
          lat={scenario.lat}
          lon={scenario.lon}
          deltaVsA={deltaVsA}
        />

        <NextGood
          scenarioKey={scenario.key}
          siteName={scenario.name}
          siteLat={scenario.lat}
          t0Ms={scenario.t0Ms}
        />
      </VStack>
    </Card>
  );
}
