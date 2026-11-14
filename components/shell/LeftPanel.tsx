"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { MAX_SCENARIOS, MAX_T0_MS, MIN_T0_MS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { useCatalog } from "../../lib/useCatalog";
import { LandingTime } from "../picker/LandingTime";
import { SitePicker } from "../picker/SitePicker";

const MS_PER_DAY = 86_400_000;
const ADD_STEP_DAYS = 14;

/** Id of the date field for a scenario, so a card's Edit button can focus it. */
export const dateFieldId = (key: string) => `scenario-date-${key}`;

function fallbackLabel(site: SiteRef): string {
  if (site.kind === "custom") return `${site.lat.toFixed(2)}°, ${site.lon.toFixed(2)}°`;
  const words = site.id.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Scenario rows (site + landing date) and the site picker slot. Used in the 280 wide panel and inside the drawer. */
export function LeftPanel() {
  const scenarios = useAppStore((s) => s.scenarios);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const catalog = useCatalog();
  const [picked, setPicked] = useState("a");
  const selected = scenarios.some((x) => x.key === picked) ? picked : (scenarios[0]?.key ?? "a");
  const last = scenarios[scenarios.length - 1];
  const nextT0 = last ? last.t0Ms + ADD_STEP_DAYS * MS_PER_DAY : MIN_T0_MS;
  const canAdd = scenarios.length < MAX_SCENARIOS && nextT0 <= MAX_T0_MS;

  return (
    <Stack gap={4} data-testid="left-panel-body">
      <Stack gap={3}>
        <Heading level={2}>Scenarios</Heading>
        <Text type="supporting" size="xsm">
          Landing date and time are UTC
        </Text>
        {scenarios.map((sc) => {
          const name = (sc.site.kind === "catalog" ? catalog?.byId.get(sc.site.id)?.name : undefined) ?? fallbackLabel(sc.site);
          return (
            <Stack key={sc.key} gap={1}>
              <Button
                label={`${sc.key.toUpperCase()} ${name}`}
                size="lg"
                variant={sc.key === selected ? "secondary" : "ghost"}
                aria-pressed={sc.key === selected}
                onClick={() => setPicked(sc.key)}
              />
              <LandingTime
                id={dateFieldId(sc.key)}
                letter={sc.key.toUpperCase()}
                t0Ms={sc.t0Ms}
                onCommit={(t0Ms) => updateScenario(sc.key, { t0Ms })}
              />
            </Stack>
          );
        })}
        <Button
          label={`Add scenario +${ADD_STEP_DAYS} d`}
          size="lg"
          variant="secondary"
          icon={<Icon icon={Plus} />}
          isDisabled={!canAdd}
          onClick={() => addScenario({ site: last ? { ...last.site } : undefined, t0Ms: nextT0 })}
        />
      </Stack>
      <SitePicker scenarioKey={selected} />
    </Stack>
  );
}
