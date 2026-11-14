"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { MAX_SCENARIOS, MAX_T0_MS, MIN_T0_MS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { useCatalog } from "../../lib/useCatalog";

const MS_PER_DAY = 86_400_000;
const ADD_STEP_DAYS = 14;
const COVERAGE_MESSAGE = "Ephemeris covers 1969–2035";

/** Id of the date field for a scenario, so a card's Edit button can focus it. */
export const dateFieldId = (key: string) => `scenario-date-${key}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function fallbackLabel(site: SiteRef): string {
  if (site.kind === "custom") return `${site.lat.toFixed(2)}°, ${site.lon.toFixed(2)}°`;
  const words = site.id.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface DateFieldProps {
  id: string;
  label: string;
  t0Ms: number;
  disabled: boolean;
  onCommit: (t0Ms: number) => void;
}

/** Landing date as YYYY-MM-DD (UTC). Commits a valid in-range date as it is typed; keeps the time of day. */
function DateField({ id, label, t0Ms, disabled, onCommit }: DateFieldProps) {
  const value = isoDate(t0Ms);
  const [edit, setEdit] = useState<{ base: string; text: string } | null>(null);
  // Show the typed text only while it was typed against the current value; a new value resets it.
  const draft = edit && edit.base === value ? edit.text : value;
  const setDraft = (text: string) => setEdit({ base: value, text });
  const change = (v: string) => {
    setDraft(v);
    if (!DATE_RE.test(v)) return;
    const day = Date.parse(`${v}T00:00:00Z`);
    if (!Number.isFinite(day) || isoDate(day) !== v) return;
    const next = day + (((t0Ms % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY);
    if (next >= MIN_T0_MS && next <= MAX_T0_MS) onCommit(next);
  };
  return (
    <TextInput
      id={id}
      label={label}
      isLabelHidden
      size="lg"
      value={draft}
      placeholder="YYYY-MM-DD"
      isDisabled={disabled}
      disabledMessage={disabled ? COVERAGE_MESSAGE : undefined}
      description={disabled ? COVERAGE_MESSAGE : undefined}
      onChange={change}
      onBlur={() => setDraft(value)}
    />
  );
}

/** Scenario rows (site + landing date) and the site picker slot. Used in the 280 wide panel and inside the drawer. */
export function LeftPanel() {
  const scenarios = useAppStore((s) => s.scenarios);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const catalog = useCatalog();
  const last = scenarios[scenarios.length - 1];
  const nextT0 = last ? last.t0Ms + ADD_STEP_DAYS * MS_PER_DAY : MIN_T0_MS;
  const canAdd = scenarios.length < MAX_SCENARIOS && nextT0 <= MAX_T0_MS;

  return (
    <Stack gap={4} data-testid="left-panel-body">
      <Stack gap={3}>
        <Heading level={2}>Scenarios</Heading>
        {scenarios.map((sc) => {
          const outside = sc.t0Ms < MIN_T0_MS || sc.t0Ms > MAX_T0_MS;
          const name = (sc.site.kind === "catalog" ? catalog?.byId.get(sc.site.id)?.name : undefined) ?? fallbackLabel(sc.site);
          return (
            <Stack key={sc.key} gap={1}>
              <Text type="label" weight="medium">{`${sc.key.toUpperCase()} ${name}`}</Text>
              <DateField
                id={dateFieldId(sc.key)}
                label={`Landing date ${sc.key.toUpperCase()}`}
                t0Ms={sc.t0Ms}
                disabled={outside}
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
      <EmptyState isCompact headingLevel={2} title="Site picker" description="Pick a site on the map or search the catalogue." />
    </Stack>
  );
}
