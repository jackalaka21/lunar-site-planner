"use client";

import { useContext, useMemo } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Typeahead, TypeaheadItem } from "@astryxdesign/core/Typeahead";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import type { Site } from "../../lib/data/sites";
import { MAX_T0_MS, MIN_T0_MS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import { useCatalog } from "../../lib/useCatalog";
import { CloseDrawerContext } from "../shell/DrawerContext";
import { CoordInput } from "./CoordInput";
import { GROUP_HEADING, GROUP_ORDER, SiteList, formatLatLon, siteSearchMeta } from "./SiteList";

export { GROUP_ORDER, GROUP_HEADING };

type SiteItem = SearchableItem<{ site: Site; group: string }>;

// auxiliaryData.group makes Typeahead render a non-selectable heading above each category's results.
const toItem = (s: Site): SiteItem => ({
  id: s.id,
  label: s.name,
  auxiliaryData: { site: s, group: GROUP_HEADING[s.group] },
});

/** Every word typed must appear in the name, id or group, in any order: "apollo 11" finds Apollo 11 Eagle. */
export function matchSites(sites: Site[], query: string): Site[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits = sites.filter((s) => {
    const hay = `${s.name} ${s.id.replace(/-/g, " ")} ${GROUP_HEADING[s.group]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  // Group in category order, so the headings Typeahead draws never repeat. Array.sort is stable.
  return hits.sort((x, y) => GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group));
}

/** Longest wait for the drawer to leave the DOM before scrolling to the map anyway. */
const DRAWER_CLOSE_CAP_MS = 1000;
// Drawer and BottomSheet are native <dialog> elements (implicit dialog role) labelled "Scenarios".
const DRAWER_SELECTOR = 'dialog[open][aria-label="Scenarios"], [role="dialog"][aria-label="Scenarios"]';

const round3 = (v: number) => String(Math.round(v * 1000) / 1000 + 0);

interface SitePickerProps {
  scenarioKey: string;
}

/** Choose the site for one scenario: search the catalogue, click a map, or type coordinates. */
export function SitePicker({ scenarioKey }: SitePickerProps) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.key === scenarioKey));
  const updateScenario = useAppStore((s) => s.updateScenario);
  const catalog = useCatalog();
  const closeDrawer = useContext(CloseDrawerContext);

  const source = useMemo<SearchSource<SiteItem>>(
    () => ({
      search: (q) => matchSites(catalog?.sites ?? [], q).map(toItem),
      bootstrap: () => [],
    }),
    [catalog],
  );

  if (!scenario) return null;
  const letter = scenarioKey.toUpperCase();
  const chosen = scenario.site.kind === "catalog" ? catalog?.byId.get(scenario.site.id) : undefined;
  const choose = (id: string) => updateScenario(scenarioKey, { site: { kind: "catalog", id } });
  const here = chosen ?? (scenario.site.kind === "custom" ? scenario.site : null);
  const actualMs = chosen?.actual_landing_utc ? Date.parse(chosen.actual_landing_utc) : NaN;
  const canUseActual = Number.isFinite(actualMs) && actualMs >= MIN_T0_MS && actualMs <= MAX_T0_MS;

  const coords = (
    <CoordInput
      key={`${scenarioKey}:${here ? `${here.lat},${here.lon}` : "none"}`}
      initialLat={here ? round3(here.lat) : ""}
      initialLon={here ? round3(here.lon) : ""}
      onCommit={(lat, lon) => updateScenario(scenarioKey, { site: { kind: "custom", lat, lon } })}
    />
  );

  /** The map lives below the 3D render in the workspace: scroll to it and focus it. */
  const jumpToMap = () => {
    const go = () => {
      const panel = document.querySelector<HTMLElement>('[data-testid="scenario-map"]');
      if (!panel) return;
      const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      panel.querySelector<SVGElement>("svg[data-testid^='map-']")?.focus({ preventScroll: true });
    };
    if (closeDrawer) {
      // Let the drawer finish closing (it locks page scroll and traps focus) before scrolling.
      closeDrawer();
      const started = performance.now();
      const poll = () => {
        const open = document.querySelector(DRAWER_SELECTOR) !== null;
        if (open && performance.now() - started < DRAWER_CLOSE_CAP_MS) requestAnimationFrame(poll);
        else requestAnimationFrame(go);
      };
      requestAnimationFrame(poll);
    } else go();
  };

  return (
    <Stack gap={3} data-testid="site-picker" data-tour-id="tour-site-picker">
      <Heading level={3}>{`Site for scenario ${letter}`}</Heading>
      <Stack gap={3} id="site-panel-search">
        <Typeahead<SiteItem>
          label="Search sites"
          isLabelHidden
          placeholder="Search"
          size="lg"
          searchSource={source}
          value={null}
          hasClear={false}
          debounceMs={0}
          renderItem={(item) => (
            <TypeaheadItem
              item={item}
              description={item.auxiliaryData ? siteSearchMeta(item.auxiliaryData.site) : undefined}
            />
          )}
          onChange={(item) => {
            if (item) choose(item.id);
          }}
        />
        {chosen ? (
          <SiteDetail
            site={chosen}
            canUseActual={canUseActual}
            onUseActual={() => updateScenario(scenarioKey, { t0Ms: actualMs })}
          />
        ) : null}
        {coords}
        <Button
          label="Jump to map"
          size="lg"
          variant="secondary"
          icon={<Icon icon={MapPin} />}
          onClick={jumpToMap}
        />
        <SiteList catalog={catalog} currentId={chosen?.id ?? null} onChoose={choose} />
        {catalog ? (
          <Text
            type="code"
            size="xsm"
            color="secondary"
          >{`Last checked ${catalog.checkedUtc}`}</Text>
        ) : null}
      </Stack>
    </Stack>
  );
}

function SiteDetail({
  site,
  canUseActual,
  onUseActual,
}: {
  site: Site;
  canUseActual: boolean;
  onUseActual: () => void;
}) {
  return (
    <Stack gap={2}>
      <Text type="code" size="xsm" color="secondary">
        {formatLatLon(site)}
      </Text>
      {site.actual_landing_utc ? (
        <>
          <Text type="supporting" size="xsm">
            {`Landed ${site.actual_landing_utc.replace("T", " ")} UTC`}
            {site.outcome ? `, ${site.outcome}` : ""}
            {site.actual_landing_source_url ? (
              <>
                {" · "}
                <Link href={site.actual_landing_source_url} target="_blank">
                  Source
                </Link>
              </>
            ) : null}
          </Text>
          <Button
            label="Use actual landing date"
            size="lg"
            variant="secondary"
            icon={<Icon icon={CalendarClock} />}
            isDisabled={!canUseActual}
            onClick={onUseActual}
          />
        </>
      ) : null}
    </Stack>
  );
}
