"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getEngine } from "../../lib/engineClient";
import type { DaySummary } from "../../lib/engine";
import type { Settings } from "../../lib/engine/settings";
import type { SiteRef } from "../../lib/state/url";
import { recordCalendarTiming } from "../../lib/timing";
import { CAL_DAYS, firstOfMonthMs } from "./calendarModel";
import { LandingCalendar } from "./LandingCalendar";

export interface CalendarDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  site: SiteRef;
  siteName: string;
  siteLat: number;
  settings: Settings;
  t0Ms: number;
  onSelect: (t0Ms: number) => void;
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; fromMs: number; days: DaySummary[]; subsolar: number[] };

/** The landing calendar in a side drawer. Fetched the first time it opens. */
export default function CalendarDrawer(p: CalendarDrawerProps) {
  const { isOpen, site, settings } = p;
  const fromMs = firstOfMonthMs(p.t0Ms);
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  // Recompute for a new site, month or settings; a pick inside the same month keeps the data.
  const key = `${JSON.stringify(site)}|${fromMs}|${JSON.stringify({ ...settings, axis: "met", displayTz: "UTC" })}|${nonce}`;

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    const t = performance.now();
    const engine = getEngine();
    const engSettings = { ...settings, axis: "met" as const, displayTz: "UTC" };
    Promise.all([
      engine.calendar({ ref: site, fromMs, days: CAL_DAYS, settings: engSettings }),
      engine.subsolar({ fromMs, days: CAL_DAYS }),
    ])
      .then(([days, subsolar]) => {
        recordCalendarTiming(performance.now() - t);
        if (live) setState({ status: "ready", fromMs, days, subsolar });
      })
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, key]);

  return (
    <Drawer isOpen={isOpen} onOpenChange={p.onOpenChange} label="Landing calendar" width="48rem">
      <Layout
        header={
          <DrawerHeader
            title="Landing calendar"
            subtitle={p.siteName}
            endContent={
              <IconButton
                label="Close"
                size="lg"
                variant="ghost"
                icon={<Icon icon={X} />}
                onClick={() => p.onOpenChange(false)}
              />
            }
          />
        }
        content={
          <LayoutContent>
            {state.status === "ready" ? (
              <LandingCalendar
                fromMs={state.fromMs}
                days={state.days}
                subsolarDeg={state.subsolar}
                siteLat={p.siteLat}
                durationDays={settings.durationDays}
                t0Ms={p.t0Ms}
                onSelect={p.onSelect}
              />
            ) : state.status === "error" ? (
              <VStack gap={3}>
                <Text>Couldn&apos;t compute the calendar.</Text>
                <Button label="Retry" size="lg" variant="secondary" onClick={() => {
                    setState({ status: "loading" });
                    setNonce((n) => n + 1);
                  }} />
              </VStack>
            ) : (
              <VStack gap={3} aria-busy="true">
                <Skeleton height="12rem" />
                <Skeleton height="4rem" index={1} />
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Drawer>
  );
}
