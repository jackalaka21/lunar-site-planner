"use client";

import { Crosshair, MapPin, Mountain, Rocket, Flag, Orbit, type LucideIcon } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import type { Site, SiteCatalog } from "../../lib/data/sites";

export const GROUP_ORDER: Site["group"][] = ["apollo", "clps", "international", "artemis3", "polar"];
export const GROUP_HEADING: Record<Site["group"], string> = {
  apollo: "Apollo",
  clps: "Commercial (CLPS)",
  international: "Other agencies",
  artemis3: "Artemis crewed landing candidates",
  polar: "Polar features",
};

const GROUP_ICON: Record<Site["group"], LucideIcon> = {
  apollo: Flag,
  clps: Rocket,
  international: Orbit,
  artemis3: Crosshair,
  polar: Mountain,
};

/** Latitude and longitude with hemisphere letters, e.g. "0.67° N, 23.47° E". */
export function formatLatLon(s: { lat: number; lon: number }): string {
  const ns = s.lat < 0 ? "S" : "N";
  const ew = s.lon < 0 ? "W" : "E";
  return `${Math.abs(s.lat).toFixed(2)}° ${ns}, ${Math.abs(s.lon).toFixed(2)}° ${ew}`;
}

/** Landing year from actual_landing_utc, or null for candidates and features with no landing. */
export function landingYear(s: Site): string | null {
  const y = s.actual_landing_utc?.slice(0, 4);
  return y && /^\d{4}$/.test(y) ? y : null;
}

/** "1969 · 0.67° N, 23.47° E", or just the coordinates when the site has no landing date. */
export function siteMeta(s: Site): string {
  const year = landingYear(s);
  return year ? `${year} · ${formatLatLon(s)}` : formatLatLon(s);
}

/** Secondary line of a search result: category first, then year and coordinates. */
export function siteSearchMeta(s: Site): string {
  return `${GROUP_HEADING[s.group]} · ${siteMeta(s)}`;
}

const ELLIPSIS = {
  display: "block",
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

interface SiteListProps {
  catalog: SiteCatalog | null;
  currentId: string | null;
  onChoose: (id: string) => void;
}

/** The browsable catalogue: a non-interactive header band per category, selectable rows beneath. */
export function SiteList({ catalog, currentId, onChoose }: SiteListProps) {
  if (!catalog) return <Text type="supporting">Loading sites</Text>;
  return (
    <Stack gap={3} data-testid="site-list">
      {GROUP_ORDER.map((g) => {
        const sites = catalog.sites.filter((s) => s.group === g);
        if (sites.length === 0) return null;
        return (
          <Stack key={g} gap={0} role="group" aria-label={GROUP_HEADING[g]} data-testid={`site-group-${g}`}>
            <Stack
              direction="horizontal"
              align="center"
              gap={2}
              paddingInline={3}
              paddingBlock={2}
              data-testid={`site-group-header-${g}`}
              style={{
                background: "var(--surface-raised)",
                borderBottom: "0.0625rem solid var(--color-border)",
              }}
            >
              <Icon icon={GROUP_ICON[g]} size="sm" color="secondary" />
              <Text type="label" weight="semibold" color="secondary" style={{ flex: 1, minWidth: 0 }}>
                {GROUP_HEADING[g]}
              </Text>
              <Token label={`${sites.length} ${sites.length === 1 ? "site" : "sites"}`} size="sm" />
            </Stack>
            <Stack
              gap={1}
              paddingBlock={1}
              style={{
                marginInlineStart: "var(--spacing-3)",
                borderInlineStart: "0.0625rem solid var(--color-border)",
              }}
            >
              {sites.map((s) => {
                const isCurrent = s.id === currentId;
                return (
                  <Button
                    key={s.id}
                    label={s.name}
                    size="lg"
                    width="100%"
                    variant={isCurrent ? "secondary" : "ghost"}
                    aria-pressed={isCurrent}
                    icon={<Icon icon={g === "artemis3" || g === "polar" ? Crosshair : MapPin} />}
                    onClick={() => onChoose(s.id)}
                    style={{ justifyContent: "flex-start", textAlign: "start" }}
                  >
                    <Stack as="span" gap={0} align="start" style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                      <Text as="span" size="sm" style={ELLIPSIS}>
                        {s.name}
                      </Text>
                      <Text as="span" type="code" size="xsm" color="secondary" style={ELLIPSIS}>
                        {siteMeta(s)}
                      </Text>
                    </Stack>
                  </Button>
                );
              })}
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}
