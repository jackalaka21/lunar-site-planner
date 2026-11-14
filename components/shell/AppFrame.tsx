"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { HStack, Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { bindUrlSync, useAppStore } from "../../lib/state/store";
import { SettingsPanel } from "../settings/SettingsPanel";
import { MissionClock } from "../ui/MissionClock";
import { LeftPanel } from "./LeftPanel";
import { Notice } from "./Notice";
import { StatStrip } from "./StatStrip";
import { TopBar } from "./TopBar";

const HEADER_HEIGHT = 56;
const PANEL_WIDTH = 280;
const CONTENT_MAX_WIDTH = 1600;
const HOUR_MS = 3_600_000;
/** 1024 at the 16 root size. Below it the left panel becomes a drawer. */
const WIDE_QUERY = "(min-width: 64rem)";

/** Frame first: header, left panel, fluid content, pinned footer. The regions are filled by later tasks. */
export function AppFrame() {
  const isWide = useMediaQuery(WIDE_QUERY);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cursorH = useAppStore((s) => s.cursorH);
  const axis = useAppStore((s) => s.settings.axis);
  const tz = useAppStore((s) => s.settings.displayTz);
  const landingMs = useAppStore((s) => s.scenarios[0]?.t0Ms ?? 0);

  useEffect(
    () =>
      bindUrlSync(useAppStore, {
        location: window.location,
        history: window.history,
        // Task 19 supplies the catalogue ids; until then any catalogue id is accepted.
        knownSiteIds: null,
      }),
    [],
  );

  return (
    <Stack height="100dvh">
      <Layout
        header={
          <LayoutHeader height={HEADER_HEIGHT} hasDivider>
            <TopBar onOpenNav={isWide ? undefined : () => setNavOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />
          </LayoutHeader>
        }
        start={
          isWide ? (
            <LayoutPanel hasDivider width={PANEL_WIDTH} role="complementary" label="Scenarios" data-testid="left-panel">
              <LeftPanel />
            </LayoutPanel>
          ) : null
        }
        content={
          <LayoutContent padding={6} label="Planner">
            <Stack gap={4} maxWidth={CONTENT_MAX_WIDTH}>
              <Notice />
              <StatStrip />
              <Stack data-testid="cards">
                <EmptyState
                  title="No results yet"
                  description="Scenario cards appear here once a site and date are set."
                />
              </Stack>
            </Stack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider data-testid="time-bar-slot">
            <HStack gap={2} vAlign="center">
              <Text color="secondary">Cursor</Text>
              <MissionClock ms={axis === "cal" ? landingMs + cursorH * HOUR_MS : cursorH * HOUR_MS} axis={axis} tz={tz} />
            </HStack>
          </LayoutFooter>
        }
      />
      {isWide ? null : (
        <Drawer isOpen={navOpen} onOpenChange={setNavOpen} label="Scenarios" side="start" width={PANEL_WIDTH}>
          <Layout
            header={<DrawerHeader title="Scenarios" onOpenChange={setNavOpen} />}
            content={
              <LayoutContent>
                <LeftPanel />
              </LayoutContent>
            }
          />
        </Drawer>
      )}
      <SettingsPanel isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
    </Stack>
  );
}
