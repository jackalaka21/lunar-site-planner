"use client";

import dynamic from "next/dynamic";
import { startTransition, useContext, useEffect, useState, type ReactNode } from "react";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Stack } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { getEngine } from "../../lib/engineClient";
import { loadCatalogOnce } from "../../lib/useCatalog";
import { decodeState } from "../../lib/state/url";
import { isDefaultState } from "../../lib/state/isDefault";
import { bindUrlSync, useAppStore } from "../../lib/state/store";
import { FirstCardContext } from "./FirstCardContext";
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
  loading: () => <FirstCardGrid />,
});
// Start the catalogue request and the engine worker as soon as this module runs, not after hydration.
if (typeof window !== "undefined" && typeof Worker !== "undefined") {
  void loadCatalogOnce().catch(() => undefined);
  void getEngine()
    .init()
    .catch(() => undefined);
}

/** Resolves when the main thread is idle (or after 1.5 s at most). */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window)
      window.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 200);
  });
}

/** The server-rendered first card in the same one-column grid the live cards use. Nothing if the view is not the default. */
function FirstCardGrid() {
  const card = useContext(FirstCardContext);
  if (!card) return null;
  return (
    <Grid columns={1} gap={4} data-testid="card-grid" data-columns={1}>
      <VStack gap={2}>{card}</VStack>
    </Grid>
  );
}

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
/** One value at every width: the server HTML cannot know the viewport, and a different one after hydration would shift the page. */
const CONTENT_PADDING = 4;
const CONTENT_MAX_WIDTH = 1600;
/** 1024 at the 16 root size. Below it the left panel becomes a drawer. */
const WIDE_QUERY = "(min-width: 64rem)";
/** Below 768: scenario editing is a bottom sheet instead of a side drawer. */
const PHONE_QUERY = "(max-width: 47.99rem)";

/** Frame first: header, left panel, fluid content, pinned footer. The regions are filled by later tasks. */
export function AppFrame({ firstCard }: { firstCard?: ReactNode }) {
  const scenarios = useAppStore((s) => s.scenarios);
  const settings = useAppStore((s) => s.settings);
  const cursorH = useAppStore((s) => s.cursorH);
  // The prerendered card is only right for the default view: not for a link that asks for something else.
  const [linkIsDefault, setLinkIsDefault] = useState(true);
  useEffect(() => {
    const { state } = decodeState(window.location.search, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkIsDefault(isDefaultState(state));
  }, []);
  const staticCard =
    linkIsDefault && isDefaultState({ scenarios, settings, cursorH }) ? (firstCard ?? null) : null;

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
      // The static card is already on screen: let the browser finish painting and hydrating before the live parts mount.
      await whenIdle();
      if (cancelled) return;
      unbind = bindUrlSync(useAppStore, {
        location: window.location,
        history: window.history,
        knownSiteIds: ids,
      });
      if (typeof Worker === "undefined") {
        useAppStore.setState((st) => ({ notices: [...st.notices, NO_WORKER_NOTICE] }));
      }
      // A transition lets React yield while it builds the cards, so no single task blocks input for long.
      startTransition(() => setReady(true));
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
    <FirstCardContext.Provider value={staticCard}>
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
                {ready ? <LeftPanel /> : null}
              </LayoutPanel>
            ) : null
          }
          content={
            <LayoutContent padding={CONTENT_PADDING} label="Planner">
              <Stack gap={4} maxWidth={CONTENT_MAX_WIDTH}>
                {mounted ? (
                  <>
                    <RegisterSW />
                    <Notice />
                  </>
                ) : null}
                <StatStrip />
                <Stack data-testid="cards">
                  {ready && typeof Worker !== "undefined" ? (
                    <CompareView onEdit={editScenario} />
                  ) : ready ? null : (
                    <FirstCardGrid />
                  )}
                </Stack>
              </Stack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider data-testid="time-bar-slot">
              {ready ? <TimeBar /> : <TimeBarPlaceholder />}
            </LayoutFooter>
          }
        />
        {!isWide && navSeen ? (
          <NavOverlay isOpen={navOpen} onOpenChange={setNavOpen} isPhone={isPhone} />
        ) : null}
        {settingsSeen ? (
          <SettingsPanel isOpen={settingsOpen} onOpenChange={setSettingsOpen} />
        ) : null}
      </Stack>
    </FirstCardContext.Provider>
  );
}
