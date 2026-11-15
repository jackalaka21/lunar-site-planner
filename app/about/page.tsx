"use client";

import { useEffect, useState } from "react";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Outline, type OutlineItem } from "@astryxdesign/core/Outline";
import { VStack } from "@astryxdesign/core/Stack";
import { Table, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { ScrollRegion } from "../../components/about/ScrollRegion";
import { ValidationTable, type ValidationEntry, type ValidationReport } from "../../components/about/ValidationTable";
import { AI_DISCLOSURE, limitations, NASA_DATASETS, PARTNERS, type Dataset } from "../../components/about/content";
import { DEFAULT_SETTINGS } from "../../lib/engine/settings";
import { encodeState, type UrlState } from "../../lib/state/url";

const OUTLINE_ITEMS: OutlineItem[] = [
  { id: "what-this-is", label: "What this is", level: 2 },
  { id: "method", label: "Method", level: 2 },
  { id: "nasa-data", label: "NASA data used", level: 2 },
  { id: "partners", label: "Partner credits", level: 2 },
  { id: "validation", label: "Validation", level: 2 },
  { id: "replays", label: "Mission replays", level: 2 },
  { id: "limitations", label: "Limitations", level: 2 },
  { id: "ai-use", label: "AI use", level: 2 },
  { id: "credits", label: "Credits", level: 2 },
];

const VALIDATION_SECTIONS: ReadonlyArray<{ key: string; title: string }> = [
  { key: "horizons", title: "Sun and Earth direction against JPL Horizons" },
  { key: "interp", title: "Hourly interpolation" },
  { key: "sanity", title: "Sanity checks" },
  { key: "illumination", title: "Illumination against PGDA and published values" },
  { key: "eclipses", title: "Lunar eclipses against NASA's Five Millennium Catalog" },
  { key: "replays", title: "Mission replays against reported events" },
];

interface SiteRecord {
  id: string;
  name: string;
  actual_landing_utc?: string;
}
interface KernelRecord {
  name: string;
  sha256: string;
}

const REPLAY_IDS = ["chandrayaan-3", "slim", "im-2"] as const;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** Share link that opens the planner on one site at its real landing time, built with the app's own encoder. */
function replayHref(siteId: string, actualUtc: string): string {
  const state: UrlState = {
    scenarios: [{ key: "A", site: { kind: "catalog", id: siteId }, t0Ms: Date.parse(actualUtc.replace("Z", ":00Z")) }],
    settings: DEFAULT_SETTINGS,
    cursorH: 0,
  };
  return `/?${encodeState(state)}`;
}

const BODY_STYLE = { lineHeight: 1.65 } as const;
const WRAP_STYLE = { overflowWrap: "anywhere", wordBreak: "break-word" } as const;
// Sticky needs every ancestor to be free of overflow auto/hidden/scroll; LayoutPanel is clipped, not scrollable, so this holds.
const STICKY_STYLE = { position: "sticky", top: "1.5rem", alignSelf: "flex-start", maxHeight: "calc(100vh - 3rem)", overflowY: "auto" } as const;

const LIT_LABEL = { any: "any part of the disc", half: "at least 50% of the disc", full: "the whole disc" } as const;

interface SettingRow extends Record<string, unknown> {
  id: string;
  setting: string;
  value: string;
  note: string;
}

function methodRows(): SettingRow[] {
  const d = DEFAULT_SETTINGS;
  const rows: Array<[string, string, string]> = [
    ["Sun counted as lit", LIT_LABEL[d.litThreshold], "Share of the Sun's disc above the terrain horizon."],
    ["Earth margin", `${d.earthMarginDeg}°`, "Extra elevation Earth needs above the horizon to count as in view."],
    ["Mission length", `${d.durationDays} d`, "How long each scenario is scanned from landing."],
    ["Battery reserve", `${d.batteryH} h`, "Longest dark spell the verdict treats as survivable."],
    ["Flicker merge", `${d.flickerMergeMin} min`, "Lit or dark spells shorter than this are merged into their neighbours."],
    ["Solar interference", `${d.interferenceDeg}°`, "Earth within this angle of the Sun counts as noisy for the radio link."],
    ["DSN elevation mask", `${d.dsnMaskDeg}°`, "Minimum Moon elevation at a ground station; the layer is off by default."],
    ["Horizon uncertainty", `±${d.horizonUncertDeg}°`, "Added to the terrain horizon to show how fragile a result is."],
    ["Landing ellipse", `${d.ellipseKm} km`, "Radius sampled around the site to test whether the result holds nearby."],
    ["Observer height", `${d.mastM} m`, "Height of the mast above the DEM surface."],
  ];
  return rows.map(([setting, value, note]) => ({ id: setting, setting, value, note }));
}

interface DatasetRow extends Record<string, unknown> {
  id: string;
  d: Dataset;
}

export default function AboutPage() {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [sites, setSites] = useState<SiteRecord[] | null>(null);
  const [kernels, setKernels] = useState<KernelRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      getJson<ValidationReport>("/data/v1/validation.json"),
      getJson<{ sites: SiteRecord[] }>("/data/v1/sites.json"),
      getJson<{ kernels: KernelRecord[] }>("/data/v1/ephemeris/index.json"),
    ])
      .then(([v, s, e]) => {
        if (!live) return;
        setReport(v);
        setSites(s.sites);
        setKernels(e.kernels);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : "Could not load data");
      });
    return () => {
      live = false;
    };
  }, []);

  const datasetRows: DatasetRow[] = NASA_DATASETS.map((d) => ({ id: d.href, d }));
  const replays = REPLAY_IDS.map((id) => sites?.find((s) => s.id === id)).filter(
    (s): s is SiteRecord => s !== undefined && s.actual_landing_utc !== undefined,
  );

  return (
    <Layout
      height="auto"
      contentWidth={960}
      end={
        <LayoutPanel isScrollable={false} label="On this page" role="complementary">
          <VStack data-testid="about-outline" style={STICKY_STYLE}>
            <Outline items={OUTLINE_ITEMS} />
          </VStack>
        </LayoutPanel>
      }
      content={
        <LayoutContent isScrollable={false} padding={8}>
          <VStack gap={10}>
            <VStack gap={2}>
              <Text type="display-1">About Ridgeline</Text>
              <Link href="/" isStandalone>
                Back to the planner
              </Link>
            </VStack>

            <VStack gap={5}>
              <Heading id="what-this-is" level={2}>
                What this is
              </Heading>
              <Text type="body" style={BODY_STYLE}>
                Ridgeline compares lunar landing sites and dates. For each scenario it shows when the Sun and Earth are above the real
                terrain horizon, so you can see when a lander has both power and a direct line to Earth, and how long it sits in the
                dark. It answers the NASA Space Apps challenge Lunar Landing Site Navigator.
              </Text>
              <Text type="body" color="secondary" style={BODY_STYLE}>
                Everything runs in your browser from files served with the site. There is no account and no call to a third-party
                service while you use it.
              </Text>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="method" level={2}>
                Method
              </Heading>
              <Text type="body" style={BODY_STYLE}>
                Sun and Earth directions come from the DE440 ephemeris, rotated into the Moon&apos;s mean-Earth frame with the NAIF lunar
                orientation kernels, with light-time and stellar aberration applied, sampled hourly and interpolated. Each direction is
                compared with the terrain horizon at the site, built from LOLA elevation data. The Sun and Earth are treated as discs,
                not points, so a body half behind a ridge is half lit. Eclipses of the Sun by Earth come from the disc geometry as seen
                from the Moon. Results are merged into lit and dark spells and scored against the thresholds below. These are the defaults
                a new scenario starts with; each can be changed in the settings panel.
              </Text>
              <ScrollRegion label="Default settings (scrollable table)">
              <Table<SettingRow>
                aria-label="Default settings"
                density="compact"
                data={methodRows()}
                idKey="id"
                columns={[
                  { key: "setting", header: "Setting", width: proportional(2, { minWidth: 160 }) },
                  { key: "value", header: "Default", width: proportional(2, { minWidth: 160 }) },
                  { key: "note", header: "What it does", width: proportional(5, { minWidth: 280 }) },
                ]}
              />
              </ScrollRegion>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="nasa-data" level={2}>
                NASA data used
              </Heading>
              <Text type="body" style={BODY_STYLE}>
                Every dataset Ridgeline uses is listed here with its source and its job. Versions, file sizes and SHA-256 checksums are in
                DATA_SOURCES.md in the repository.
              </Text>
              <ScrollRegion label="NASA datasets (scrollable table)">
              <Table<DatasetRow>
                aria-label="NASA datasets"
                density="compact"
                verticalAlign="top"
                data={datasetRows}
                idKey="id"
                columns={[
                  {
                    key: "name",
                    header: "Dataset",
                    width: proportional(3, { minWidth: 240 }),
                    renderCell: (r) => (
                      <Text type="label" weight="medium">
                        {r.d.name}
                      </Text>
                    ),
                  },
                  {
                    key: "source",
                    header: "Source link",
                    width: proportional(2, { minWidth: 180 }),
                    renderCell: (r) => (
                      <Link href={r.d.href} target="_blank" rel="noopener noreferrer" isExternalLink>
                        {r.d.source}
                      </Link>
                    ),
                  },
                  {
                    key: "role",
                    header: "What it does in Ridgeline",
                    width: proportional(4, { minWidth: 280 }),
                    renderCell: (r) => <Text>{r.d.role}</Text>,
                  },
                ]}
              />
              </ScrollRegion>
              {kernels ? (
                <VStack gap={2}>
                  <Text type="label" weight="medium">
                    SPICE kernels in this build (SHA-256)
                  </Text>
                  <List density="compact" listStyle="none">
                    {kernels.map((k) => (
                      <ListItem key={k.name} label={k.name} description={<Text type="supporting" style={WRAP_STYLE}>{k.sha256}</Text>} />
                    ))}
                  </List>
                </VStack>
              ) : null}
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="partners" level={2}>
                Partner credits
              </Heading>
              <Text type="body" style={BODY_STYLE}>Landing sites and events come from the missions of these agencies, as listed in the challenge resources.</Text>
              <List density="compact" listStyle="none">
                {PARTNERS.map((p) => (
                  <ListItem
                    key={p.name}
                    label={
                      <Link href={p.href} target="_blank" rel="noopener noreferrer" isExternalLink>
                        {p.name}
                      </Link>
                    }
                    description={p.detail}
                  />
                ))}
              </List>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="validation" level={2}>
                Validation
              </Heading>
              <Text type="body" style={BODY_STYLE}>
                Each check compares Ridgeline against an independent reference. Passing, failing and informational results are all shown,
                with the method in each note. A failure stays on this page.
              </Text>
              {error ? <Text type="body" style={BODY_STYLE}>Validation results could not be loaded ({error}).</Text> : null}
              {report ? (
                <VStack gap={8}>
                  <Text type="supporting" size="xsm">
                    Report generated {String(report.generatedUtc)} UTC
                  </Text>
                  {VALIDATION_SECTIONS.map(({ key, title }) => {
                    const entries = report[key];
                    if (!Array.isArray(entries) || entries.length === 0) return null;
                    return (
                      <VStack key={key} gap={4}>
                        <Heading level={3}>{title}</Heading>
                        <ValidationTable caption={title} entries={entries as ValidationEntry[]} />
                      </VStack>
                    );
                  })}
                </VStack>
              ) : error ? null : (
                <Text type="supporting">Loading validation results</Text>
              )}
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="replays" level={2}>
                Mission replays
              </Heading>
              <Text type="body" style={BODY_STYLE}>
                Open the planner at a real landing site and the time of touchdown. Chandrayaan-3 has a landing date only, so its replay
                starts at 00:00 UTC on that date.
              </Text>
              <List density="compact" listStyle="none">
                {replays.map((s) => {
                  const utc = s.actual_landing_utc as string;
                  return (
                    <ListItem
                      key={s.id}
                      label={<Link href={replayHref(s.id, utc)}>{s.name}</Link>}
                      description={`Landed ${utc}${utc.endsWith("T00:00Z") ? " (date only, time not published)" : ""}`}
                    />
                  );
                })}
              </List>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="limitations" level={2}>
                Limitations
              </Heading>
              <List density="compact" listStyle="disc">
                {limitations(DEFAULT_SETTINGS.ellipseKm).map((l) => (
                  <ListItem key={l} label={l} />
                ))}
              </List>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="ai-use" level={2}>
                AI use
              </Heading>
              <Text type="body" style={BODY_STYLE}>{AI_DISCLOSURE}</Text>
            </VStack>

            <Divider />

            <VStack gap={5}>
              <Heading id="credits" level={2}>
                Credits
              </Heading>
              <List density="compact" listStyle="disc">
                <ListItem label="Interface design direction: unslop by Damir Sokolovsky (@heydamir), CC BY 4.0" />
                <ListItem label="Design system: Astryx by Meta" />
              </List>
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
