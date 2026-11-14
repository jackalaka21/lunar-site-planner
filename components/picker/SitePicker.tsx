"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack } from "@astryxdesign/core/Stack";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Typeahead } from "@astryxdesign/core/Typeahead";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import type { Site, SiteCatalog } from "../../lib/data/sites";
import { MAX_T0_MS, MIN_T0_MS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import { useCatalog } from "../../lib/useCatalog";
import { CoordInput } from "./CoordInput";
import { MapPicker, type MapMode } from "./MapPicker";

export const GROUP_ORDER: Site["group"][] = ["apollo", "clps", "international", "artemis3", "polar"];
export const GROUP_HEADING: Record<Site["group"], string> = {
  apollo: "Apollo",
  clps: "Commercial (CLPS)",
  international: "Other agencies",
  artemis3: "Artemis crewed landing candidates",
  polar: "Polar features",
};

type SiteItem = SearchableItem<Site>;

const toItem = (s: Site): SiteItem => ({ id: s.id, label: s.name, auxiliaryData: s });

/** Every word typed must appear in the name, id or group, in any order: "apollo 11" finds Apollo 11 Eagle. */
export function matchSites(sites: Site[], query: string): Site[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return sites.filter((s) => {
    const hay = `${s.name} ${s.id.replace(/-/g, " ")} ${GROUP_HEADING[s.group]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const coordText = (s: { lat: number; lon: number }) => `${s.lat.toFixed(2)}°, ${s.lon.toFixed(2)}°`;
const round3 = (v: number) => String(Math.round(v * 1000) / 1000 + 0);

interface SitePickerProps {
  scenarioKey: string;
}

/** Choose the site for one scenario: search the catalogue, click a map, or type coordinates. */
export function SitePicker({ scenarioKey }: SitePickerProps) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.key === scenarioKey));
  const updateScenario = useAppStore((s) => s.updateScenario);
  const catalog = useCatalog();
  const [tab, setTab] = useState<"search" | "map">("search");
  const [mapMode, setMapMode] = useState<MapMode>("south");

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

  return (
    <Stack gap={3} data-testid="site-picker">
      <Heading level={3}>{`Site for scenario ${letter}`}</Heading>
      <TabList
        value={tab}
        onChange={(v) => setTab(v === "map" ? "map" : "search")}
        role="tablist"
        size="lg"
        hasDivider
        aria-label="Choose a site"
      >
        <Tab value="search" label="Search" panelId="site-panel-search" />
        <Tab value="map" label="Map" panelId="site-panel-map" />
      </TabList>

      {tab === "search" ? (
        <Stack gap={3} id="site-panel-search" role="tabpanel" aria-label="Search">
          <Typeahead<SiteItem>
            label="Search sites"
            isLabelHidden
            placeholder="Search"
            size="lg"
            searchSource={source}
            value={null}
            hasClear={false}
            debounceMs={0}
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
          <SiteList catalog={catalog} currentId={chosen?.id ?? null} onChoose={choose} />
          {catalog ? (
            <Text type="code" size="xsm" color="secondary">{`Last checked ${catalog.checkedUtc}`}</Text>
          ) : null}
        </Stack>
      ) : (
        <Stack gap={3} id="site-panel-map" role="tabpanel" aria-label="Map">
          <SegmentedControl
            label="Map view"
            size="lg"
            layout="fill"
            value={mapMode}
            onChange={(v) => setMapMode(v === "global" ? "global" : "south")}
          >
            <SegmentedControlItem value="south" label="South pole" />
            <SegmentedControlItem value="global" label="Whole Moon" />
          </SegmentedControl>
          <MapPicker scenarioKey={scenarioKey} mode={mapMode} />
          {coords}
        </Stack>
      )}
    </Stack>
  );
}

function SiteDetail({ site, canUseActual, onUseActual }: { site: Site; canUseActual: boolean; onUseActual: () => void }) {
  return (
    <Stack gap={2}>
      <Text type="code" size="xsm" color="secondary">
        {coordText(site)}
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

function SiteList({
  catalog,
  currentId,
  onChoose,
}: {
  catalog: SiteCatalog | null;
  currentId: string | null;
  onChoose: (id: string) => void;
}) {
  if (!catalog) return <Text type="supporting">Loading sites</Text>;
  return (
    <Stack gap={3} data-testid="site-list">
      {GROUP_ORDER.map((g) => {
        const sites = catalog.sites.filter((s) => s.group === g);
        if (sites.length === 0) return null;
        return (
          <Stack key={g} gap={1}>
            <Heading level={4}>{GROUP_HEADING[g]}</Heading>
            {sites.map((s) => (
              <Button
                key={s.id}
                label={s.name}
                size="lg"
                width="100%"
                variant={s.id === currentId ? "secondary" : "ghost"}
                aria-pressed={s.id === currentId}
                onClick={() => onChoose(s.id)}
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}
