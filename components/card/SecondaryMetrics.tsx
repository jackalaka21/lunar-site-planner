"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { fmtHours, fmtPct } from "../../lib/engine/format";
import type { Metrics } from "../../lib/engine/metrics";
import type { TimeSeries } from "../../lib/engine/sample";
import { MissionClock } from "../ui/MissionClock";
import { ToolLinks } from "./ToolLinks";
import { formatDelta } from "./delta";

export interface SecondaryMetricsProps {
  metrics: Metrics;
  series: TimeSeries;
  cursorIndex: number;
  axis: "met" | "cal";
  tz?: string;
  lat: number;
  lon: number;
  deltaVsA?: { bothH: number; sunlitH: number; longestDarkH: number };
}

const deg = (v: number) => `${v.toFixed(1)}°`;

/** Collapsed by default. Figures, deltas, the az/el at the cursor, and links to the challenge tools. */
export function SecondaryMetrics({ metrics, series, cursorIndex, axis, tz, lat, lon, deltaVsA }: SecondaryMetricsProps) {
  const [open, setOpen] = useState(false);
  const i = Math.max(0, Math.min(series.n - 1, cursorIndex));
  const withDelta = (figure: string, d?: number) => (d === undefined ? figure : `${figure} (${formatDelta(d)})`);
  const clock = (absMs: number) => (
    <MissionClock ms={axis === "met" ? absMs - series.t0Ms : absMs} axis={axis} tz={tz} />
  );
  return (
    <VStack gap={3}>
      <Button
        label={open ? "Hide details" : "Show details"}
        variant="ghost"
        size="lg"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      />
      {open && (
        <VStack gap={4}>
          <MetadataList columns="multi">
            <MetadataListItem label="Sunlit">
              {withDelta(`${fmtHours(metrics.sunlitH)} (${fmtPct(metrics.sunlitPct)})`, deltaVsA?.sunlitH)}
            </MetadataListItem>
            <MetadataListItem label="Earth in view">
              {`${fmtHours(metrics.earthH)} (${fmtPct(metrics.earthPct)})`}
            </MetadataListItem>
            <MetadataListItem label="Longest dark">
              {withDelta(fmtHours(metrics.longestDarkH), deltaVsA?.longestDarkH)}
            </MetadataListItem>
            <MetadataListItem label="Longest comms gap">{fmtHours(metrics.longestCommsGapH)}</MetadataListItem>
            <MetadataListItem label="First sunset">
              {metrics.firstSunsetMs === null ? "None in window" : clock(metrics.firstSunsetMs)}
            </MetadataListItem>
            <MetadataListItem label="Mean power proxy">{metrics.meanPower.toFixed(2)}</MetadataListItem>
          </MetadataList>
          <MetadataList columns="multi" title="At the cursor">
            <MetadataListItem label="Sun azimuth">{deg(series.sunAz[i])}</MetadataListItem>
            <MetadataListItem label="Sun elevation">{deg(series.sunEl[i])}</MetadataListItem>
            <MetadataListItem label="Earth azimuth">{deg(series.earthAz[i])}</MetadataListItem>
            <MetadataListItem label="Earth elevation">{deg(series.earthEl[i])}</MetadataListItem>
          </MetadataList>
          <VStack gap={2}>
            <Text type="label">Check this site</Text>
            <ToolLinks lat={lat} lon={lon} />
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}
