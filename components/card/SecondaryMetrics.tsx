"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { downloadScenarioCsv } from "../../lib/csv";
import { fmtHours, fmtPct } from "../../lib/engine/format";
import { approachGlareCheck } from "../../lib/engine/glare";
import type { Metrics } from "../../lib/engine/metrics";
import type { TimeSeries } from "../../lib/engine/sample";
import { tipOverResilience } from "../../lib/engine/tipover";
import { useAppStore } from "../../lib/state/store";
import { MissionClock } from "../ui/MissionClock";
import { ToolLinks } from "./ToolLinks";
import { formatDelta } from "./delta";

export interface SecondaryMetricsProps {
  scenarioName?: string;
  t0Ms?: number;
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

/** Collapsed by default. Figures, deltas, tip-over resilience, glare check, CSV export, az/el at cursor, and tool links. */
export function SecondaryMetrics({
  scenarioName = "scenario",
  t0Ms,
  metrics,
  series,
  cursorIndex,
  axis,
  tz,
  lat,
  lon,
  deltaVsA,
}: SecondaryMetricsProps) {
  const [open, setOpen] = useState(false);
  const [headingDeg, setHeadingDeg] = useState(180);
  const settings = useAppStore((s) => s.settings);
  const i = Math.max(0, Math.min(series.n - 1, cursorIndex));
  const withDelta = (figure: string, d?: number) =>
    d === undefined ? figure : `${figure} (${formatDelta(d)})`;
  const clock = (absMs: number) => (
    <MissionClock ms={axis === "met" ? absMs - series.t0Ms : absMs} axis={axis} tz={tz} />
  );

  const tipOver = useMemo(
    () => (open ? tipOverResilience(series, settings, 10) : null),
    [open, series, settings],
  );
  const glare = useMemo(
    () => (open ? approachGlareCheck(series, headingDeg, 20) : null),
    [open, series, headingDeg],
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
              {withDelta(
                `${fmtHours(metrics.sunlitH)} (${fmtPct(metrics.sunlitPct)})`,
                deltaVsA?.sunlitH,
              )}
            </MetadataListItem>
            <MetadataListItem label="Earth in view">
              {`${fmtHours(metrics.earthH)} (${fmtPct(metrics.earthPct)})`}
            </MetadataListItem>
            <MetadataListItem label="Longest dark">
              {withDelta(fmtHours(metrics.longestDarkH), deltaVsA?.longestDarkH)}
            </MetadataListItem>
            <MetadataListItem label="Longest comms gap">
              {fmtHours(metrics.longestCommsGapH)}
            </MetadataListItem>
            <MetadataListItem label="First sunset">
              {metrics.firstSunsetMs === null ? "None in window" : clock(metrics.firstSunsetMs)}
            </MetadataListItem>
            <MetadataListItem label="Mean power proxy">
              {metrics.meanPower.toFixed(2)}
            </MetadataListItem>
            {tipOver ? (
              <>
                <MetadataListItem label="Tip-over worst Both (10° tilt)">
                  {`${fmtHours(tipOver.worstBothH)} (tilted toward ${tipOver.worstBothAzDeg}°)`}
                </MetadataListItem>
                <MetadataListItem label="Tip-over worst power (10° tilt)">
                  {`${tipOver.worstPower.toFixed(2)} (tilted toward ${tipOver.worstPowerAzDeg}°)`}
                </MetadataListItem>
              </>
            ) : null}
          </MetadataList>

          {glare ? (
            <VStack gap={2}>
              <HStack gap={3} vAlign="end" wrap="wrap">
                <NumberInput
                  label="Descent approach heading"
                  value={headingDeg}
                  min={0}
                  max={359}
                  step={5}
                  units="°"
                  isIntegerOnly
                  onChange={(v) =>
                    setHeadingDeg(Math.min(359, Math.max(0, Number.isFinite(v) ? v : 180)))
                  }
                />
                <Text type="supporting" size="sm">
                  {glare.warning
                    ? glare.warning
                    : `Clear approach (${glare.angularDiffDeg.toFixed(0)}° from Sun at landing, shadow index ${Math.round(glare.shadowFraction * 100)}%)`}
                </Text>
              </HStack>
            </VStack>
          ) : null}

          <MetadataList columns="multi" title="At the cursor">
            <MetadataListItem label="Sun azimuth">{deg(series.sunAz[i])}</MetadataListItem>
            <MetadataListItem label="Sun elevation">{deg(series.sunEl[i])}</MetadataListItem>
            <MetadataListItem label="Earth azimuth">{deg(series.earthAz[i])}</MetadataListItem>
            <MetadataListItem label="Earth elevation">{deg(series.earthEl[i])}</MetadataListItem>
          </MetadataList>

          <HStack gap={2} vAlign="center" wrap="wrap">
            <Button
              label="Export CSV"
              size="lg"
              variant="secondary"
              icon={<Icon icon={Download} />}
              onClick={() =>
                downloadScenarioCsv(
                  { name: scenarioName, lat, lon, t0Ms: t0Ms ?? series.t0Ms },
                  series,
                  metrics,
                )
              }
            />
          </HStack>

          <VStack gap={2}>
            <Text type="label">Check this site</Text>
            <ToolLinks lat={lat} lon={lon} />
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}
