"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Stack } from "@astryxdesign/core/Stack";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { MissionClock } from "../ui/MissionClock";

function siteLabel(site: SiteRef): string {
  if (site.kind === "custom") return `${site.lat.toFixed(2)}°, ${site.lon.toFixed(2)}°`;
  const words = site.id.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Scenario rows (List, not cards) and the site picker slot. Used in the 280 wide panel and inside the drawer. */
export function LeftPanel() {
  const scenarios = useAppStore((s) => s.scenarios);
  const tz = useAppStore((s) => s.settings.displayTz);
  return (
    <Stack gap={4} data-testid="left-panel-body">
      <Stack gap={1}>
        <Heading level={2}>Scenarios</Heading>
        <List density="compact" hasDividers edge="flush">
          {scenarios.map((sc) => (
            <ListItem
              key={sc.key}
              itemKey={sc.key}
              label={`${sc.key.toUpperCase()} ${siteLabel(sc.site)}`}
              description={<MissionClock ms={sc.t0Ms} axis="cal" tz={tz} />}
            />
          ))}
        </List>
      </Stack>
      <EmptyState isCompact headingLevel={2} title="Site picker" description="Pick a site on the map or search the catalogue." />
    </Stack>
  );
}
