"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getEngine } from "../../lib/engineClient";
import type { DaySummary } from "../../lib/engine";
import { MAX_SCENARIOS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import { distinctWindows } from "../calendar/calendarModel";
import { MissionClock } from "../ui/MissionClock";

// The calendar is fetched the first time it opens, so first-view JavaScript does not grow.
const CalendarDrawer = dynamic(() => import("../calendar/CalendarDrawer"), { ssr: false });

export interface PlanningProps {
  scenarioKey: string;
  siteName: string;
  siteLat: number;
  t0Ms: number;
}

const SHOWN = 3;
/** Ask for many 6 h hits so a long Good window cannot crowd out the later ones. */
const HITS = 60;
const NO_GOOD = "No Good landing in the next 365 days at this site";
const FULL = "Four scenarios is the maximum. Remove one to add another.";

/** Find next good date, with up to three distinct windows, and the landing calendar drawer. */
export function NextGood(p: PlanningProps) {
  const scenario = useAppStore((st) => st.scenarios.find((x) => x.key === p.scenarioKey));
  const settings = useAppStore((st) => st.settings);
  const canAdd = useAppStore((st) => st.scenarios.length < MAX_SCENARIOS);
  const addScenario = useAppStore((st) => st.addScenario);
  const updateScenario = useAppStore((st) => st.updateScenario);
  const [results, setResults] = useState<DaySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [calMounted, setCalMounted] = useState(false);

  if (!scenario) return null;
  const site = scenario.site;
  const find = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const hits = await getEngine().nextGood({
        ref: site,
        fromMs: p.t0Ms,
        settings: { ...settings, axis: "met", displayTz: "UTC" },
        count: HITS,
      });
      setResults(distinctWindows(hits, p.t0Ms, SHOWN));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={3} data-testid="next-good">
      <HStack gap={2} wrap="wrap" vAlign="center">
        <Button label="Find next good date" size="lg" variant="secondary" isLoading={busy} onClick={find} />
        <Button
          label="Landing calendar"
          size="lg"
          variant="ghost"
          onClick={() => {
            setCalMounted(true);
            setCalOpen(true);
          }}
        />
      </HStack>
      {failed ? <Text type="supporting">Couldn&apos;t search for dates. Try again.</Text> : null}
      {results && results.length === 0 ? <EmptyState isCompact title={NO_GOOD} /> : null}
      {results && results.length > 0 ? (
        <VStack gap={1} role="list" aria-label="Next good dates">
          {results.map((r) => (
            <HStack key={r.t0Ms} gap={3} vAlign="center" hAlign="between" wrap="wrap" role="listitem">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <MissionClock ms={r.t0Ms} axis="cal" tz="UTC" />
                <Text type="supporting" size="xsm">
                  {`Good, ${Math.round(r.bothH)} h with Sun and Earth`}
                </Text>
              </HStack>
              <Button
                label="Add as scenario"
                size="lg"
                variant="secondary"
                isDisabled={!canAdd}
                tooltip={canAdd ? undefined : FULL}
                onClick={() => canAdd && addScenario({ site, t0Ms: r.t0Ms })}
              />
            </HStack>
          ))}
        </VStack>
      ) : null}
      {calMounted ? (
        <CalendarDrawer
          isOpen={calOpen}
          onOpenChange={setCalOpen}
          site={site}
          siteName={p.siteName}
          siteLat={p.siteLat}
          settings={settings}
          t0Ms={p.t0Ms}
          onSelect={(t) => {
            updateScenario(p.scenarioKey, { t0Ms: t });
            setCalOpen(false);
          }}
        />
      ) : null}
    </VStack>
  );
}
