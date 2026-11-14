"use client";

import { useMemo } from "react";
import { Pencil, X } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { EventKind } from "../../lib/engine/events";
import { fmtHours } from "../../lib/engine/format";
import type { Metrics } from "../../lib/engine/metrics";
import type { RobustnessResult } from "../../lib/engine/robustness";
import { mergeFlickers, type TimeSeries } from "../../lib/engine/sample";
import type { SiteContext } from "../../lib/engine/types";
import { HorizonPanorama } from "../panorama/HorizonPanorama";
import { Timeline } from "../timeline/Timeline";
import { MissionClock } from "../ui/MissionClock";
import { Term } from "../ui/Term";
import { MetricsBar } from "./MetricsBar";
import { Provenance } from "./Provenance";
import { SecondaryMetrics } from "./SecondaryMetrics";
import { VerdictChip } from "./VerdictChip";
import { formatDelta, formatSpan } from "./delta";

export interface ScenarioCardProps {
  scenario: { key: string; name: string; groupTag?: string; lat: number; lon: number; t0Ms: number };
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
  onSeek: (index: number) => void;
  onScrubTime?: (deltaMs: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}

const POLE_LAT = 89.9;
const NONE_WITHIN = "> 60 d";

export function ScenarioCard(p: ScenarioCardProps) {
  const { scenario, result, cursorIndex, axis, tz, countdowns, deltaVsA, robust } = p;
  const { ctx, series, metrics } = result;
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

  const countdown = (at: number | null) => (at === null ? NONE_WITHIN : formatSpan(at - cursorMs));
  const sunLit = merged.lit[idx] === 1;
  const earthUp = merged.earth[idx] === 1;
  const earthValue =
    metrics.earthH === 0
      ? "Earth never in view"
      : countdown(earthUp ? countdowns.earthset : countdowns.earthrise);

  const robustRange = robust
    ? `${Math.round(robust.bothH.min)} to ${Math.round(robust.bothH.max)} h`
    : undefined;

  return (
    <Card padding={5} data-testid={`scenario-card-${scenario.key}`}>
      <VStack gap={5}>
        <HStack gap={2} vAlign="center" hAlign="between">
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Text type="label" weight="medium">
                {`${letter} ${scenario.name}`}
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
              <MissionClock ms={axis === "met" ? idx * series.stepMs : cursorMs} axis={axis} tz={tz} />
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
          robustRange={robustRange}
          sun={{
            label: <Term id="sunset">{sunLit ? "Sunset in" : "Sunrise in"}</Term>,
            value: countdown(sunLit ? countdowns.sunset : countdowns.sunrise),
          }}
          earth={{
            label: <Term id={earthUp ? "earthset" : "earthrise"}>{earthUp ? "Earthset in" : "Earthrise in"}</Term>,
            value: earthValue,
          }}
          sunEl={{
            label: <Term id="elevation">Sun elevation now</Term>,
            value: `${series.sunEl[idx].toFixed(1)}°`,
          }}
        />

        <HorizonPanorama
          horizon={ctx.horizon}
          series={series}
          cursorIndex={idx}
          elDomain={p.elDomain}
          centerAz={p.centerAz}
          onScrubTime={p.onScrubTime}
          pole={Math.abs(scenario.lat) >= POLE_LAT}
        />

        <Timeline
          series={series}
          metrics={metrics}
          cursorIndex={idx}
          axis={axis}
          tz={tz}
          flickerMergeMin={p.flickerMergeMin}
          onSeek={p.onSeek}
        />

        <Provenance ctx={ctx} />

        <SecondaryMetrics
          metrics={metrics}
          series={series}
          cursorIndex={idx}
          axis={axis}
          tz={tz}
          lat={scenario.lat}
          lon={scenario.lon}
          deltaVsA={deltaVsA}
        />
      </VStack>
    </Card>
  );
}
