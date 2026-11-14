"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Stack } from "@astryxdesign/core/Stack";
import { loadCatalogOnce } from "../../lib/useCatalog";
import { bindUrlSync, useAppStore } from "../../lib/state/store";
import { dateFieldId } from "./ids";
import { RegisterSW } from "../pwa/RegisterSW";
import { Notice } from "./Notice";
import { StatStrip } from "./StatStrip";
import { TopBar } from "./TopBar";

// Overlays are fetched the first time they open, keeping them out of the first view's JavaScript.
const SettingsPanel = dynamic(
  () => import("../settings/SettingsPanel").then((m) => m.SettingsPanel),
  { ssr: false },
);
// The cards (panorama, timeline, metrics) and the scenario editor load right after the shell paints.
const CompareView = dynamic(() => import("../compare/CompareView").then((m) => m.CompareView), {
  ssr: false,
});
/** Holds the time bar's height while its chunk loads, so the page above it does not jump. */
function TimeBarPlaceholder() {
  const isPhone = useMediaQuery(PHONE_QUERY);
  return <Stack minHeight={isPhone ? TIME_BAR_PHONE_HEIGHT : TIME_BAR_HEIGHT} />;
}
const TimeBar = dynamic(() => import("../time/TimeBar").then((m) => m.TimeBar), {
  ssr: false,
  loading: () => <TimeBarPlaceholder />,
});
const LeftPanel = dynamic(() => import("./LeftPanel").then((m) => m.LeftPanel), { ssr: false });
const NavOverlay = dynamic(() => import("./NavOverlay"), { ssr: false });

const NO_WORKER_NOTICE = "This browser can't run the calculator (Web Workers unavailable).";
const HEADER_HEIGHT = 56;
const PANEL_WIDTH = 280;
const TIME_BAR_HEIGHT = 61;
const TIME_BAR_PHONE_HEIGHT = 125;
const CONTENT_MAX_WIDTH = 1600;
/** 1024 at the 16 root size. Below it the left panel becomes a drawer. */
const WIDE_QUERY = "(min-width: 64rem)";
/** Below 768: scenario editing is a bottom sheet instead of a side drawer. */
const PHONE_QUERY = "(max-width: 47.99rem)";

/** Frame first: header, left panel, fluid content, pinned footer. The regions are filled by later tasks. */
export function AppFrame() {
  const isWide = useMediaQuery(WIDE_QUERY);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navSeen, setNavSeen] = useState(false);
  const [settingsSeen, setSettingsSeen] = useState(false);
  const openNav = () => {
    setNavSeen(true);
    setNavOpen(true);
  };
  const openSettings = () => {
    setSettingsSeen(true);
    setSettingsOpen(true);
  };

  const [ready, setReady] = useState(false);
  // useMediaQuery is false until mounted. Content and the menu button wait for it, so a wide screen never
  // paints the narrow layout first and then jumps.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

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
      unbind = bindUrlSync(useAppStore, {
        location: window.location,
        history: window.history,
        knownSiteIds: ids,
      });
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
      openNav();
      return;
    }
    document.getElementById(dateFieldId(key))?.focus();
  };

  return (
    <Stack height="100dvh">
      <Layout
        header={
          <LayoutHeader height={HEADER_HEIGHT} hasDivider>
            <TopBar
              onOpenNav={isWide || !mounted ? undefined : openNav}
              onOpenSettings={openSettings}
            />
          </LayoutHeader>
        }
        start={
          isWide || !mounted ? (
            <LayoutPanel
              hasDivider
              width={PANEL_WIDTH}
              role="complementary"
              label="Scenarios"
              data-testid="left-panel"
            >
              <LeftPanel />
            </LayoutPanel>
          ) : null
        }
        content={
          <LayoutContent padding={isPhone ? 3 : 6} label="Planner">
            <Stack gap={4} maxWidth={CONTENT_MAX_WIDTH}>
              {mounted ? (
                <>
                  <RegisterSW />
                  <Notice />
                  <StatStrip />
                </>
              ) : null}
              <Stack data-testid="cards">
                {ready && typeof Worker !== "undefined" ? (
                  <CompareView onEdit={editScenario} />
                ) : null}
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
      {!isWide && navSeen ? (
        <NavOverlay isOpen={navOpen} onOpenChange={setNavOpen} isPhone={isPhone} />
      ) : null}
      {settingsSeen ? <SettingsPanel isOpen={settingsOpen} onOpenChange={setSettingsOpen} /> : null}
    </Stack>
  );
}
