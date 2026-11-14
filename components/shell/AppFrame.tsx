"use client";

import { useEffect, useState } from "react";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Stack } from "@astryxdesign/core/Stack";
import { CompareView } from "../compare/CompareView";
import { loadCatalogOnce } from "../../lib/useCatalog";
import { bindUrlSync, useAppStore } from "../../lib/state/store";
import { SettingsPanel } from "../settings/SettingsPanel";
import { TimeBar } from "../time/TimeBar";
import { dateFieldId, LeftPanel } from "./LeftPanel";
import { Notice } from "./Notice";
import { StatStrip } from "./StatStrip";
import { TopBar } from "./TopBar";

const NO_WORKER_NOTICE = "This browser can't run the calculator (Web Workers unavailable).";
const HEADER_HEIGHT = 56;
const PANEL_WIDTH = 280;
const CONTENT_MAX_WIDTH = 1600;
/** 1024 at the 16 root size. Below it the left panel becomes a drawer. */
const WIDE_QUERY = "(min-width: 64rem)";

/** Frame first: header, left panel, fluid content, pinned footer. The regions are filled by later tasks. */
export function AppFrame() {
  const isWide = useMediaQuery(WIDE_QUERY);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [ready, setReady] = useState(false);

  // Read the catalogue first so a link with an unknown site id is corrected (with a notice) on load.
  useEffect(() => {
    let cancelled = false;
    let unbind: (() => void) | null = null;
    (async () => {
      let ids: Set<string> | null = null;
      try {
        ids = new Set((await loadCatalogOnce()).sites.map((x) => x.id));
      } catch {
        // Without the catalogue every card shows its own error with Retry; accept any id meanwhile.
      }
      if (cancelled) return;
      unbind = bindUrlSync(useAppStore, { location: window.location, history: window.history, knownSiteIds: ids });
      if (typeof Worker === "undefined") {
        useAppStore.setState((st) => ({ notices: [...st.notices, NO_WORKER_NOTICE] }));
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      unbind?.();
    };
  }, []);

  const editScenario = (key: string) => {
    if (!isWide) {
      setNavOpen(true);
      return;
    }
    document.getElementById(dateFieldId(key))?.focus();
  };

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
                {ready && typeof Worker !== "undefined" ? <CompareView onEdit={editScenario} /> : null}
              </Stack>
            </Stack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider data-testid="time-bar-slot">
            <TimeBar />
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
