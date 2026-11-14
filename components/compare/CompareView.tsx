"use client";

import { useContext, useMemo } from "react";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Stack } from "@astryxdesign/core/Stack";
import { useAppStore } from "../../lib/state/store";
import { GROUP_LABEL } from "../../lib/siteGroups";
import { useCatalog } from "../../lib/useCatalog";
import { useScenarioResults } from "../../lib/useScenarioResults";
import { sharedElDomain } from "../panorama/layout";
import { SwipeDeck } from "../ui/SwipeDeck";
import { FirstCardContext } from "../shell/FirstCardContext";
import { ScenarioSlot } from "./ScenarioSlot";

const HOURS_PER_DAY = 24;
const DESKTOP_QUERY = "(min-width: 64rem)";
const PHONE_QUERY = "(max-width: 47.99rem)";
const FALLBACK_DOMAIN: [number, number] = [-2, 8];

interface CompareViewProps {
  /** Focus the editor for a scenario (a date field in the left panel, or its drawer). */
  onEdit: (key: string) => void;
}

/**
 * The comparison grid. Each scenario is evaluated in the engine worker; every card shares one elevation
 * domain (small multiples) and one cursor. 1 card = 1 column, 2 = 2 columns, 3 or 4 = 2 x 2 on desktop,
 * one column on tablet, a swipe deck on phones.
 */
export function CompareView({ onEdit }: CompareViewProps) {
  const scenarios = useAppStore((s) => s.scenarios);
  const settings = useAppStore((s) => s.settings);
  const cursorH = useAppStore((s) => s.cursorH);
  const playing = useAppStore((s) => s.playing);
  const setCursorH = useAppStore((s) => s.setCursorH);
  const removeScenario = useAppStore((s) => s.removeScenario);
  const catalog = useCatalog();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const firstCard = useContext(FirstCardContext);

  const { slots, retry } = useScenarioResults(scenarios, settings);

  const elDomain = useMemo(() => {
    const items = scenarios.flatMap((sc) => {
      const slot = slots[sc.key];
      if (slot?.status !== "ready") return [];
      const c = slot.result.ctx;
      return [{ horizon: { stepDeg: c.horizonStepDeg, elevDeg: c.horizonDeg }, series: slot.result.series }];
    });
    return items.length > 0 ? sharedElDomain(items) : FALLBACK_DOMAIN;
  }, [scenarios, slots]);

  const maxH = settings.durationDays * HOURS_PER_DAY;
  const seekH = (h: number) => setCursorH(Math.min(maxH, Math.max(0, h)));
  const aT0Ms = scenarios[0]?.t0Ms ?? 0;
  const slotA = scenarios[0] ? slots[scenarios[0].key] : undefined;
  const a = slotA?.status === "ready" ? slotA.result.metrics : null;

  if (scenarios.length === 0) {
    return <EmptyState title="No scenarios" description="Add a scenario to see its results." />;
  }

  const nodes = scenarios.map((sc, i) => {
    const site = sc.site.kind === "catalog" ? catalog?.byId.get(sc.site.id) : undefined;
    const slot = slots[sc.key];
    const m = slot?.status === "ready" ? slot.result.metrics : null;
    const deltaVsA =
      i > 0 && a && m
        ? { bothH: m.bothH - a.bothH, sunlitH: m.sunlitH - a.sunlitH, longestDarkH: m.longestDarkH - a.longestDarkH }
        : undefined;
    const name =
      site?.name ??
      (sc.site.kind === "custom" ? `${sc.site.lat.toFixed(2)}°, ${sc.site.lon.toFixed(2)}°` : sc.site.id);
    return (
      <ScenarioSlot
        key={sc.key}
        scenario={sc}
        slot={slot}
        onRetry={() => retry(sc.key)}
        fallback={i === 0 ? firstCard : undefined}
        ctx={{
          name,
          groupTag: site ? GROUP_LABEL[site.group] : undefined,
          aT0Ms,
          deltaVsA,
          elDomain,
          cursorH,
          playing,
          settings,
          onSeekH: seekH,
          onEdit: () => onEdit(sc.key),
          onRemove: () => removeScenario(sc.key),
          canRemove: scenarios.length > 1,
        }}
      />
    );
  });

  if (isPhone && scenarios.length > 1) return (
      <SwipeDeck label="Scenario cards">
        {nodes.map((n) => (
          <Stack key={n.key} width="calc(100vw - 3rem)">
            {n}
          </Stack>
        ))}
      </SwipeDeck>
    );
  const columns = isDesktop && scenarios.length > 1 ? 2 : 1;
  return (
    <Grid columns={columns} gap={4} data-testid="card-grid" data-columns={columns}>
      {nodes}
    </Grid>
  );
}
