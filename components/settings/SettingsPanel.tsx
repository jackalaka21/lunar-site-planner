"use client";

import { X } from "lucide-react";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Field } from "@astryxdesign/core/Field";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { SETTINGS_RANGES, type Settings } from "../../lib/engine/settings";
import { GLOSSARY, type GlossaryId } from "../../lib/glossary";
import { Term } from "../ui/Term";
import { useAppStore } from "../../lib/state/store";

interface SettingsPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

type RangedKey = keyof typeof SETTINGS_RANGES;

/** Clamp to the Global Constraints range; non-finite input falls back to the lower bound. */
export function clampSetting(key: RangedKey, value: number): number {
  const { min, max } = SETTINGS_RANGES[key];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const TIME_ZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Asia/Singapore", label: "Singapore" },
];

const PANEL_AZ_RANGE = { min: 0, max: 359 };
export const MAST_DISABLED_MESSAGE =
  "Mast height options apply to catalogue sites only; grid and sphere horizons use a 2 m mast";

export function SettingsPanel({ isOpen, onOpenChange }: SettingsPanelProps) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const scenarios = useAppStore((s) => s.scenarios);
  const hasCatalogSite = scenarios.some((sc) => sc.site.kind === "catalog");

  const ranged = (
    key: RangedKey,
    glossaryId: GlossaryId,
    units: string,
    step: number,
    isIntegerOnly = false,
    isDisabled = false,
    disabledMessage?: string,
  ) => (
    <Stack gap={0}>
      <Term id={glossaryId} />
      <NumberInput
        label={GLOSSARY[glossaryId].term}
        isLabelHidden
        width="100%"
        value={settings[key]}
        min={SETTINGS_RANGES[key].min}
        max={SETTINGS_RANGES[key].max}
        step={step}
        units={units}
        isIntegerOnly={isIntegerOnly}
        isDisabled={isDisabled}
        disabledMessage={disabledMessage}
        onChange={(v) => setSettings({ [key]: clampSetting(key, v) } as Partial<Settings>)}
      />
    </Stack>
  );

  const group = (id: GlossaryId, control: React.ReactNode, isDisabled = false) => (
    <Stack gap={0}>
      <Term id={id} />
      <Field
        label={GLOSSARY[id].term}
        isLabelHidden
        inputID={`setting-${id}`}
        isGroupLabel
        isDisabled={isDisabled}
      >
        {control}
      </Field>
    </Stack>
  );

  const zoneItems = TIME_ZONES.some((z) => z.value === settings.displayTz)
    ? TIME_ZONES
    : [...TIME_ZONES, { value: settings.displayTz, label: settings.displayTz }];

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} label="Settings" purpose="form" width={400}>
      <Layout
        header={
          <DrawerHeader
            title="Settings"
            endContent={
              <IconButton
                label="Close"
                size="lg"
                style={{ minWidth: "2.75rem", minHeight: "2.75rem", flexShrink: 0 }}
                variant="ghost"
                icon={<Icon icon={X} />}
                onClick={() => onOpenChange(false)}
              />
            }
          />
        }
        content={
          <LayoutContent>
            <Stack
              data-testid="settings-column"
              style={{ width: "100%", maxWidth: "22rem", marginInline: "auto", boxSizing: "border-box" }}
            >
            <FormLayout>
              {group(
                "litThreshold",
                <SegmentedControl
                  label={GLOSSARY.litThreshold.term}
                  size="lg"
                  layout="fill"
                  value={settings.litThreshold}
                  onChange={(v) => setSettings({ litThreshold: v as Settings["litThreshold"] })}
                >
                  <SegmentedControlItem value="any" label="Any" />
                  <SegmentedControlItem value="half" label="Half" />
                  <SegmentedControlItem value="full" label="Full" />
                </SegmentedControl>,
              )}
              {ranged("earthMarginDeg", "earthMargin", "°", 0.5)}
              {ranged("durationDays", "duration", "d", 1, true)}
              {ranged("batteryH", "batteryReserve", "h", 1, true)}
              {ranged("flickerMergeMin", "flicker", "min", 5, true)}
              {ranged("interferenceDeg", "solarInterference", "°", 0.5)}
              <Stack gap={0}>
                <Term id="dsn" />
                <Switch
                  label={GLOSSARY.dsn.term}
                  isLabelHidden
                  value={settings.dsnEnabled}
                  onChange={(v) => setSettings({ dsnEnabled: v })}
                />
              </Stack>
              {ranged(
                "dsnMaskDeg",
                "dsnMask",
                "°",
                1,
                false,
                !settings.dsnEnabled,
                "Turn on DSN to set the mask angle",
              )}
              {ranged("horizonUncertDeg", "horizonUncertainty", "°", 0.1)}
              {ranged("ellipseKm", "landingEllipse", "km", 0.5)}
              {group(
                "mastHeight",
                <SegmentedControl
                  label={GLOSSARY.mastHeight.term}
                  size="lg"
                  layout="fill"
                  value={String(settings.mastM)}
                  isDisabled={!hasCatalogSite}
                  disabledMessage={MAST_DISABLED_MESSAGE}
                  onChange={(v) => setSettings({ mastM: Number(v) as Settings["mastM"] })}
                >
                  <SegmentedControlItem value="2" label="2 m" />
                  <SegmentedControlItem value="10" label="10 m" />
                  <SegmentedControlItem value="50" label="50 m" />
                </SegmentedControl>,
                !hasCatalogSite,
              )}
              {group(
                "panelMode",
                <SegmentedControl
                  label={GLOSSARY.panelMode.term}
                  size="lg"
                  layout="fill"
                  value={settings.panel.mode}
                  onChange={(v) =>
                    setSettings({
                      panel: v === "fixed" ? { mode: "fixed", azDeg: 0 } : { mode: "tracking" },
                    })
                  }
                >
                  <SegmentedControlItem value="tracking" label="Tracking" />
                  <SegmentedControlItem value="fixed" label="Fixed" />
                </SegmentedControl>,
              )}
              {settings.panel.mode === "fixed" ? (
                <Stack gap={0}>
                  <Term id="azimuth" />
                  <NumberInput
                    label={GLOSSARY.azimuth.term}
                    isLabelHidden
                    width="100%"
                    value={settings.panel.azDeg}
                    min={PANEL_AZ_RANGE.min}
                    max={PANEL_AZ_RANGE.max}
                    units="°"
                    onChange={(v) =>
                      setSettings({
                        panel: {
                          mode: "fixed",
                          azDeg: Math.min(
                            PANEL_AZ_RANGE.max,
                            Math.max(PANEL_AZ_RANGE.min, Number.isFinite(v) ? v : 0),
                          ),
                        },
                      })
                    }
                  />
                </Stack>
              ) : null}
              {group(
                "timeAxis",
                <SegmentedControl
                  label={GLOSSARY.timeAxis.term}
                  size="lg"
                  layout="fill"
                  value={settings.axis}
                  onChange={(v) => setSettings({ axis: v as Settings["axis"] })}
                >
                  <SegmentedControlItem value="met" label="Mission clock" />
                  <SegmentedControlItem value="cal" label="Calendar" />
                </SegmentedControl>,
              )}
              {group(
                "displayTz",
                <SegmentedControl
                  label={GLOSSARY.displayTz.term}
                  size="lg"
                  layout="fill"
                  value={settings.displayTz}
                  onChange={(v) => setSettings({ displayTz: v })}
                >
                  {zoneItems.map((z) => (
                    <SegmentedControlItem key={z.value} value={z.value} label={z.label} />
                  ))}
                </SegmentedControl>,
              )}
            </FormLayout>
            </Stack>
          </LayoutContent>
        }
      />
    </Drawer>
  );
}
