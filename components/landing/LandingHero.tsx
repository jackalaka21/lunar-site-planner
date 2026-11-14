"use client";

import { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useAppStore } from "../../lib/state/store";
import type { Scenario } from "../../lib/state/url";
import { MoonHeroCanvas } from "./MoonHeroCanvas";

const WIDE_HERO_QUERY = "(min-width: 64rem)";

interface ShowcaseStage {
  id: string;
  tabLabel: string;
  badge: string;
  badgeColor: "orange" | "blue" | "gray";
  title: string;
  summary: string;
  detail: string;
  phaseDeg: number;
  focusLatDeg: number;
  ctaLabel: string;
  scenarios: Scenario[];
}

const SHOWCASE_STAGES: ShowcaseStage[] = [
  {
    id: "summer",
    tabLabel: "1. Polar summer plateau",
    badge: "317 h sunlit + Earth",
    badgeColor: "orange",
    title: "Mons Mouton plateau: 14 days of continuous grazing sunlight",
    summary:
      "At 84.8° S on 14 Jan 2027, Mons Mouton stands 5.3 km above the surrounding basin. The Sun skims the horizon between 1.5° and 2.8° without dropping behind any ridge for the entire 14-day window.",
    detail:
      "Solar power remains active for 94% of the window while Earth stays 6° to 9° above the northwestern horizon for continuous direct-to-Earth telemetry.",
    phaseDeg: -34,
    focusLatDeg: -46,
    ctaLabel: "Load Mons Mouton window",
    scenarios: [
      {
        key: "a",
        site: { kind: "catalog", id: "artemis3-mons-mouton" },
        t0Ms: Date.UTC(2027, 0, 14, 6, 0),
      },
    ],
  },
  {
    id: "ridge",
    tabLabel: "2. Crater rim occlusion",
    badge: "202 h (-115 h vs A)",
    badgeColor: "gray",
    title: "Shackleton Rim vs Mons Mouton: when a nearby peak blocks the Sun",
    summary:
      "At 89.7° S on the exact same landing date, Shackleton's narrow rim sits beside 4 km massifs. As the Sun sweeps around the horizon, a neighbouring ridge clips the solar disc after 5 d 23 h.",
    detail:
      "Switch Scenario B to the 3D Terrain View below to inspect the exact azimuth where the Sun beam intersects the crater wall.",
    phaseDeg: 22,
    focusLatDeg: -58,
    ctaLabel: "Compare Mons Mouton vs Shackleton",
    scenarios: [
      {
        key: "a",
        site: { kind: "catalog", id: "artemis3-mons-mouton" },
        t0Ms: Date.UTC(2027, 0, 14, 6, 0),
      },
      {
        key: "b",
        site: { kind: "catalog", id: "shackleton-rim" },
        t0Ms: Date.UTC(2027, 0, 14, 6, 0),
      },
    ],
  },
  {
    id: "slip",
    tabLabel: "3. Two-week launch slip",
    badge: "+14 d schedule shift",
    badgeColor: "blue",
    title: "What happens when a rocket launch slips by 14 days?",
    summary:
      "A two-week delay flips the lunar synodic phase by 180°. The Sun arrives from the opposite side of the mountain relief while Earth is half a libration cycle away.",
    detail:
      "Side-by-side comparison calculates the exact hour delta in simultaneous sunlight and Earth visibility so mission planners can re-target immediately.",
    phaseDeg: 58,
    focusLatDeg: -38,
    ctaLabel: "Compare 2-week launch slip",
    scenarios: [
      {
        key: "a",
        site: { kind: "catalog", id: "artemis3-mons-mouton" },
        t0Ms: Date.UTC(2027, 0, 14, 6, 0),
      },
      {
        key: "b",
        site: { kind: "catalog", id: "artemis3-mons-mouton" },
        t0Ms: Date.UTC(2027, 0, 28, 6, 0),
      },
    ],
  },
  {
    id: "replay",
    tabLabel: "4. Historical mission replay",
    badge: "IM-2 / CH-3 / SLIM",
    badgeColor: "blue",
    title: "Validated against real lunar landings and NASA/JPL ephemerides",
    summary:
      "Replay Intuitive Machines IM-2 Athena at Mons Mouton, ISRO Chandrayaan-3 at 69.4° S, or JAXA SLIM at Shioli crater with JPL DE440 ephemerides and LOLA terrain horizons.",
    detail:
      "Predicted sunset and solar azimuth tracks match published mission telemetry and JPL Horizons within 0.001°.",
    phaseDeg: -8,
    focusLatDeg: -28,
    ctaLabel: "Replay IM-2 Athena landing",
    scenarios: [
      {
        key: "a",
        site: { kind: "catalog", id: "im-2" },
        t0Ms: Date.parse("2025-03-06T17:30:00Z"),
      },
    ],
  },
];

function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id) ?? document.querySelector("[data-testid='cards']");
  el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

function applyPresetScenarios(scenarios: Scenario[]) {
  useAppStore.setState({ scenarios, cursorH: 0, playing: false });
  scrollToId("planner-cards");
}

export function LandingHero() {
  const isWide = useMediaQuery(WIDE_HERO_QUERY);
  const [collapsed, setCollapsed] = useState(false);
  const [stageId, setStageId] = useState<string>("summer");

  const activeStage = SHOWCASE_STAGES.find((s) => s.id === stageId) ?? SHOWCASE_STAGES[0];

  const loadLaunchSlipDemo = () => {
    applyPresetScenarios(SHOWCASE_STAGES[2].scenarios);
  };

  const loadPolarRidgeComparison = () => {
    applyPresetScenarios(SHOWCASE_STAGES[1].scenarios);
  };

  const loadMissionReplay = (id: string, isoUtc: string) => {
    applyPresetScenarios([
      {
        key: "a",
        site: { kind: "catalog", id },
        t0Ms: Date.parse(isoUtc),
      },
    ]);
  };

  if (collapsed) {
    return (
      <Card padding={4} data-testid="landing-hero">
        <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Token label="LOLA + DE440" size="sm" color="orange" />
            <Text type="label" weight="medium">
              Beyond the horizon — Lunar 3D terrain & mission window planner
            </Text>
            <Text type="supporting" size="sm">
              Simulate solar power, Earth radio line-of-sight, and 3D mountain occlusion across 29
              sites.
            </Text>
          </HStack>
          <Button
            label="Show mission guide"
            size="lg"
            variant="secondary"
            onClick={() => setCollapsed(false)}
          />
        </HStack>
      </Card>
    );
  }

  return (
    <Card padding={5} data-testid="landing-hero">
      <VStack gap={6}>
        {/* 1. Minimal Floating Pill Navbar */}
        <Card padding={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Token label="Ridgeline" size="sm" color="orange" />
              <Token label="NASA LOLA 40 m DEM" size="sm" color="gray" />
              <Token label="JPL DE440 Ephemeris" size="sm" color="blue" />
            </HStack>
            <HStack gap={1.5} vAlign="center" wrap="wrap">
              <Button
                label="Features"
                size="lg"
                variant="ghost"
                onClick={() => scrollToId("landing-features")}
              />
              <Button
                label="Lighting showcase"
                size="lg"
                variant="ghost"
                onClick={() => scrollToId("landing-showcase")}
              />
              <Button
                label="Compact view"
                size="lg"
                variant="ghost"
                onClick={() => setCollapsed(true)}
              />
              <Button
                label="Get started"
                size="lg"
                variant="primary"
                onClick={() => scrollToId("planner-cards")}
              />
            </HStack>
          </HStack>
        </Card>

        {/* 2. Centered Hero Section + Large Luminous 3D Moon */}
        <VStack gap={4} hAlign="center">
          <HStack gap={1.5} vAlign="center" hAlign="center" wrap="wrap">
            <Token label="0.1° Horizon Ray-Cast" size="sm" color="orange" />
            <Token label="Interactive 3D Terrain & Sky View" size="sm" color="blue" />
            <Token label="1969–2035 Mission Window Calculator" size="sm" color="gray" />
          </HStack>

          <Heading level={2}>
            Beyond the horizon: plan lunar landings where sunlight and Earth stay in sight
          </Heading>

          <Stack maxWidth={820}>
            <Text type="body">
              At the lunar south pole, the Sun never rises high overhead—it skims the horizon at
              barely 1.5° while 5 km massifs and crater rims cast pitch-black shadows across tens of
              kilometres. Explore real NASA LOLA 3D topography, inspect exact mountain ridge
              occlusion, and test how a two-week launch slip reshapes solar power and direct-to-Earth
              radio links.
            </Text>
          </Stack>

          <HStack gap={2} vAlign="center" hAlign="center" wrap="wrap">
            <Button
              label="Launch mission planner"
              size="lg"
              variant="primary"
              onClick={() => scrollToId("planner-cards")}
            />
            <Button
              label="Compare Mons Mouton vs Shackleton"
              size="lg"
              variant="secondary"
              onClick={loadPolarRidgeComparison}
            />
          </HStack>

          <Stack width="100%">
            <MoonHeroCanvas
              height={isWide ? 340 : 230}
              phaseDeg={activeStage.phaseDeg}
              focusLatDeg={activeStage.focusLatDeg}
            />
          </Stack>
        </VStack>

        {/* 3. Bento Grid / Features Section (4 cards) */}
        <Stack id="landing-features">
          <Grid columns={isWide ? 4 : 1} gap={3}>
            <Card padding={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Token label="3D + 2D" size="sm" color="orange" />
                  <Text type="label" weight="medium">
                    Real LOLA 3D terrain & skyline
                  </Text>
                </HStack>
                <Text type="supporting" size="sm">
                  Switch any scenario card between the 2D horizon panorama and an interactive 20×20
                  km 3D lunar terrain mesh with live Sun and Earth sightline beams.
                </Text>
              </VStack>
            </Card>

            <Card padding={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Token label="DTE + DSN" size="sm" color="blue" />
                  <Text type="label" weight="medium">
                    Earth radio & DSN stations
                  </Text>
                </HStack>
                <Text type="supporting" size="sm">
                  Tracks Earth libration, terrain ridge clearance, solar radio interference, and
                  live Goldstone, Madrid, and Canberra Deep Space Network handovers.
                </Text>
              </VStack>
            </Card>

            <Card padding={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Token label="Up to 4 sites" size="sm" color="gray" />
                  <Text type="label" weight="medium">
                    Launch-slip & site deltas
                  </Text>
                </HStack>
                <Text type="supporting" size="sm">
                  Compare up to four candidate sites or launch dates side-by-side, or scan all 365
                  days of the year on the Landing Calendar to find the next good window.
                </Text>
              </VStack>
            </Card>

            <Card padding={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Token label="10° tilt + PSR" size="sm" color="orange" />
                  <Text type="label" weight="medium">
                    Ellipse, tip-over & glare checks
                  </Text>
                </HStack>
                <Text type="supporting" size="sm">
                  Evaluate 7-point landing ellipse dispersion, 10° lander tip-over resilience,
                  descent approach glare, 20 km nearby heatmaps, and shadowed craters (PSR).
                </Text>
              </VStack>
            </Card>
          </Grid>
        </Stack>

        {/* 4. Interactive Moon Phase / Lighting Showcase Section */}
        <Stack id="landing-showcase">
          <Card padding={4}>
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={0.5}>
                  <Text type="label" weight="medium">
                    Interactive lunar lighting & mission showcase
                  </Text>
                  <Text type="supporting" size="sm">
                    Select a mission stage to transition the 3D Moon illumination above and load the
                    matching telemetry below:
                  </Text>
                </VStack>
                <HStack gap={1.5} vAlign="center" wrap="wrap">
                  {SHOWCASE_STAGES.map((st) => (
                    <Button
                      key={st.id}
                      label={st.tabLabel}
                      size="lg"
                      variant={stageId === st.id ? "primary" : "secondary"}
                      aria-pressed={stageId === st.id}
                      onClick={() => setStageId(st.id)}
                    />
                  ))}
                </HStack>
              </HStack>

              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={1.5}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Token
                      label={activeStage.badge}
                      size="sm"
                      color={activeStage.badgeColor}
                    />
                    <Text type="label" weight="medium">
                      {activeStage.title}
                    </Text>
                  </HStack>
                  <Text type="body">{activeStage.summary}</Text>
                  <Text type="supporting" size="sm">
                    {activeStage.detail}
                  </Text>
                </VStack>
                <Button
                  label={activeStage.ctaLabel}
                  size="lg"
                  variant="primary"
                  onClick={() => applyPresetScenarios(activeStage.scenarios)}
                />
              </HStack>
            </VStack>
          </Card>
        </Stack>

        {/* 5. Minimal Footer & Final CTA with Soft Lunar Horizon Glow */}
        <VStack gap={3}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Text type="label" weight="medium">
              Quick-launch a mission scenario in the planner below:
            </Text>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Button
                label="Compare 2-week launch slip"
                size="lg"
                variant="primary"
                onClick={loadLaunchSlipDemo}
              />
              <Button
                label="Mons Mouton vs Shackleton"
                size="lg"
                variant="secondary"
                onClick={loadPolarRidgeComparison}
              />
              <Button
                label="Replay IM-2 Athena"
                size="lg"
                variant="secondary"
                onClick={() => loadMissionReplay("im-2", "2025-03-06T17:30:00Z")}
              />
              <Button
                label="Replay Chandrayaan-3"
                size="lg"
                variant="secondary"
                onClick={() => loadMissionReplay("chandrayaan-3", "2023-08-23T00:00:00Z")}
              />
              <Button
                label="Replay JAXA SLIM"
                size="lg"
                variant="secondary"
                onClick={() => loadMissionReplay("slim", "2024-01-19T15:20:00Z")}
              />
            </HStack>
          </HStack>

          <MoonHeroCanvas variant="horizon" height={88} />
        </VStack>
      </VStack>
    </Card>
  );
}
