"use client";

import type { ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { X } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { EvaluateResult } from "../../lib/engineClient";
import type { RobustnessResult } from "../../lib/engine/robustness";
import type { Settings } from "../../lib/engine/settings";
import type { SiteContext } from "../../lib/engine/types";
import { useCountdowns } from "../../lib/useCountdowns";
import type { Slot } from "../../lib/useScenarioResults";
import type { Scenario } from "../../lib/state/url";
import { ScenarioCard } from "../card/ScenarioCard";

const MS_PER_HOUR = 3_600_000;
const SKELETON_HEIGHTS = [32, 96, 160, 64] as const;

export interface SlotContext {
  name: string;
  groupTag?: string;
  /** Scenario A (first card), for the shared calendar clock and the deltas. */
  aT0Ms: number;
  deltaVsA?: { bothH: number; sunlitH: number; longestDarkH: number };
  elDomain: [number, number];
  cursorH: number;
  playing: boolean;
  settings: Settings;
  onSeekH: (h: number) => void;
  onEdit: () => void;
  onRemove: () => void;
  /** False for the only scenario, which cannot be removed. */
  canRemove?: boolean;
}

function toSiteContext(c: EvaluateResult["ctx"]): SiteContext {
  return {
    lat: c.lat,
    lon: c.lon,
    hDemM: c.hDemM,
    obsHeightM: c.obsHeightM,
    source: c.source,
    horizon: { stepDeg: c.horizonStepDeg, elevDeg: c.horizonDeg },
  };
}

/** Hours since this scenario's landing at the shared cursor. met: the cursor itself. cal: absolute time. */
export function cardCursorH(axis: Settings["axis"], cursorH: number, aT0Ms: number, t0Ms: number): number {
  return axis === "cal" ? cursorH + (aT0Ms - t0Ms) / MS_PER_HOUR : cursorH;
}

function LoadingCard({ label }: { label: string }) {
  return (
    <Card padding={5} data-testid="scenario-loading" aria-busy="true" aria-label={`Loading scenario ${label}`}>
      <VStack gap={4}>
        {SKELETON_HEIGHTS.map((h, i) => (
          <Skeleton key={h} height={`${h * 4}px`} index={i} />
        ))}
      </VStack>
    </Card>
  );
}

function ErrorCard({ label, onRetry, onRemove }: { label: string; onRetry: () => void; onRemove?: () => void }) {
  return (
    <Card padding={5} data-testid="scenario-error">
      <HStack gap={3} vAlign="center" wrap="wrap">
        <Text type="label" weight="medium">{`Scenario ${label}`}</Text>
        <Text>Couldn&apos;t load data —</Text>
        <Button label="Retry" size="lg" variant="secondary" onClick={onRetry} />
        {onRemove ? (
          <IconButton
            label={`Remove scenario ${label}`}
            tooltip="Remove"
            variant="ghost"
            size="lg"
            icon={<Icon icon={X} />}
            onClick={onRemove}
          />
        ) : null}
      </HStack>
    </Card>
  );
}

interface ScenarioSlotProps {
  scenario: Scenario;
  slot: Slot | undefined;
  ctx: SlotContext;
  onRetry: () => void;
  /** Shown in place of the loading skeleton (the prerendered card for the default view). */
  fallback?: ReactNode;
}

/** One scenario: loading skeleton, inline error with Retry, or the full card with live countdowns. */
export function ScenarioSlot({ scenario, slot, ctx, onRetry, fallback }: ScenarioSlotProps) {
  const letter = scenario.key.toUpperCase();
  const { settings } = ctx;
  const ready = slot?.status === "ready" ? slot : null;
  const series = ready?.result.series ?? null;

  const hCard = cardCursorH(settings.axis, ctx.cursorH, ctx.aT0Ms, scenario.t0Ms);
  const rawIndex = series ? Math.round((hCard * MS_PER_HOUR) / series.stepMs) : 0;
  const index = series ? Math.max(0, Math.min(series.n - 1, rawIndex)) : 0;
  const cursorMs = series ? series.t0Ms + index * series.stepMs : null;

  const countdowns = useCountdowns(scenario.site, cursorMs, settings, ctx.playing, ready !== null);

  if (slot?.status === "error") return <ErrorCard label={letter} onRetry={onRetry} onRemove={ctx.canRemove === false ? undefined : ctx.onRemove} />;
  if (!ready || !series) return fallback ? <VStack gap={2}>{fallback}</VStack> : <LoadingCard label={letter} />;

  const outside = settings.axis === "cal" ? (rawIndex < 0 ? "Before landing" : rawIndex > series.n - 1 ? "After mission" : null) : null;
  const r = ready.result;
  const robust: RobustnessResult | undefined = ready.robust;

  // Seeking from this card's own timeline or panorama maps back to the shared cursor.
  const seekIndex = (i: number) => {
    const h = (i * series.stepMs) / MS_PER_HOUR;
    ctx.onSeekH(settings.axis === "cal" ? h + (scenario.t0Ms - ctx.aT0Ms) / MS_PER_HOUR : h);
  };

  return (
    <VStack gap={2}>
      {outside ? (
        <Banner
          status="info"
          container="card"
          collapsible={false}
          title={outside}
          description={
            outside === "Before landing"
              ? `Scenario ${letter} has not landed at this time`
              : `Scenario ${letter} is past its ${settings.durationDays} d mission window`
          }
        />
      ) : null}
      <ScenarioCard
        scenario={{
          key: scenario.key,
          name: ctx.name,
          groupTag: ctx.groupTag,
          siteId: scenario.site.kind === "catalog" ? scenario.site.id : undefined,
          lat: r.ctx.lat,
          lon: r.ctx.lon,
          t0Ms: scenario.t0Ms,
        }}
        result={{ ctx: toSiteContext(r.ctx), series, metrics: r.metrics }}
        cursorIndex={index}
        axis={settings.axis}
        tz={settings.displayTz}
        elDomain={ctx.elDomain}
        flickerMergeMin={settings.flickerMergeMin}
        countdowns={countdowns}
        deltaVsA={ctx.deltaVsA}
        robust={robust}
        onSeek={seekIndex}
        onScrubTime={(deltaMs) => ctx.onSeekH(ctx.cursorH + deltaMs / MS_PER_HOUR)}
        onEdit={ctx.onEdit}
        onRemove={ctx.onRemove}
      />
    </VStack>
  );
}
