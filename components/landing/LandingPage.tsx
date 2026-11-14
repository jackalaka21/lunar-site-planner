"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { useAppStore } from "../../lib/state/store";
import type { Scenario } from "../../lib/state/url";
import { MONS_MOUTON_COPY, REPLAY_COPY, RIDGE_COPY, SLIP_COPY } from "../../lib/landing/copy";
import { ThemeToggle } from "../ThemeToggle";
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
  focusLonDeg: number;
  ctaLabel: string;
  scenarios: Scenario[];
}

const SHOWCASE_STAGES: ShowcaseStage[] = [
  {
    id: "summer",
    tabLabel: "1. Polar summer plateau",
    badge: MONS_MOUTON_COPY.badge,
    badgeColor: "orange",
    title: MONS_MOUTON_COPY.title,
    summary: MONS_MOUTON_COPY.summary,
    detail: MONS_MOUTON_COPY.detail,
    phaseDeg: -34,
    focusLatDeg: -48,
    focusLonDeg: 29,
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
    badge: RIDGE_COPY.badge,
    badgeColor: "gray",
    title: RIDGE_COPY.title,
    summary: RIDGE_COPY.summary,
    detail: RIDGE_COPY.detail,
    phaseDeg: 24,
    focusLatDeg: -60,
    focusLonDeg: 125,
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
    title: SLIP_COPY.title,
    summary: SLIP_COPY.summary,
    detail: SLIP_COPY.detail,
    phaseDeg: 58,
    focusLatDeg: -38,
    focusLonDeg: 29,
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
    title: REPLAY_COPY.title,
    summary: REPLAY_COPY.summary,
    detail: REPLAY_COPY.detail,
    phaseDeg: -10,
    focusLatDeg: -28,
    focusLonDeg: 32,
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

export interface LandingPageProps {
  onEnterPlanner?: (scenarios?: Scenario[]) => void;
}

export function LandingPage({ onEnterPlanner }: LandingPageProps) {
  const router = useRouter();
  const isWide = useMediaQuery(WIDE_HERO_QUERY);
  const [stageId, setStageId] = useState<string>("summer");
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const activeStage = SHOWCASE_STAGES.find((s) => s.id === stageId) ?? SHOWCASE_STAGES[0];

  const enterPlanner = (scenarios?: Scenario[]) => {
    if (scenarios && scenarios.length > 0) {
      useAppStore.setState({ scenarios, cursorH: 0, playing: false });
    }
    if (onEnterPlanner) {
      onEnterPlanner(scenarios);
    } else {
      scrollToId("planner-cards");
    }
  };

  const loadLaunchSlipDemo = () => {
    enterPlanner(SHOWCASE_STAGES[2].scenarios);
  };

  const loadPolarRidgeComparison = () => {
    enterPlanner(SHOWCASE_STAGES[1].scenarios);
  };

  const loadMissionReplay = (id: string, isoUtc: string) => {
    enterPlanner([
      {
        key: "a",
        site: { kind: "catalog", id },
        t0Ms: Date.parse(isoUtc),
      },
    ]);
  };

  return (
    <div
      data-testid="landing-page"
      style={{
        minHeight: "100dvh",
        width: "100%",
        background: "var(--surface-deepest)",
        color: "var(--color-text-primary)",
        overflowX: "hidden",
      }}
    >
      <div
        data-testid="landing-hero"
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: isWide ? "20px 28px 36px" : "14px 16px 28px",
        }}
      >
        <VStack gap={6}>
          {/* 1. Minimal Floating Pill Navbar */}
          <div
            style={{
              position: "sticky",
              top: 16,
              zIndex: 20,
              backdropFilter: "blur(16px)",
              borderRadius: 999,
              border: "1px solid var(--color-border-emphasized)",
              background: "color-mix(in srgb, var(--color-background-card) 78%, transparent)",
              padding: "10px 20px",
            }}
          >
            <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Token label="Ridgeline" size="sm" color="orange" />
                <Token label="NASA LOLA + DE440" size="sm" color="blue" />
              </HStack>
              <HStack gap={1.5} vAlign="center" wrap="wrap">
                <Button
                  label="Features"
                  size="lg"
                  variant="ghost"
                  onClick={() => scrollToId("landing-features")}
                />
                <Button
                  label="3D Showcase"
                  size="lg"
                  variant="ghost"
                  onClick={() => scrollToId("landing-showcase")}
                />
                <Button
                  label="Validation & Data"
                  size="lg"
                  variant="ghost"
                  onClick={() => router.push("/about")}
                />
                <ThemeToggle />
                <Button
                  label="Get started"
                  size="lg"
                  variant="primary"
                  onClick={() => enterPlanner()}
                />
              </HStack>
            </HStack>
          </div>

          {/* 2. Full-Viewport Hero Section */}
          <div
            style={{
              textAlign: "center",
              opacity: entered ? 1 : 0.92,
              transform: entered ? "translateY(0)" : "translateY(8px)",
              transition:
                "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1), transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <VStack gap={4} hAlign="center">
              <HStack gap={1.5} vAlign="center" hAlign="center" wrap="wrap">
                <Token label="3,600-azimuth LOLA horizons (0.1° steps)" size="sm" color="orange" />
                <Token label="Interactive 3D Terrain & Sky View" size="sm" color="blue" />
                <Token label="1969–2035 Mission Window Calculator" size="sm" color="gray" />
              </HStack>

              <Heading level={1}>Beyond the horizon: navigate lunar landings in 3D</Heading>

              <Stack maxWidth={820}>
                <Text type="body">
                  Near the south pole the Sun stays within a few degrees of the horizon (about 1.5°
                  at the pole itself, up to about 7° at Mons Mouton), so mountains and crater walls cast long shadows and can block the line of sight to
                  Earth. Ridgeline computes Sun and Earth visibility against NASA LOLA terrain
                  horizons and JPL ephemerides, so you can find windows where solar power and
                  direct-to-Earth communications are available together.
                </Text>
              </Stack>

              <HStack gap={2} vAlign="center" hAlign="center" wrap="wrap">
                <Button
                  label="Launch 3D mission planner"
                  size="lg"
                  variant="primary"
                  onClick={() => enterPlanner()}
                />
                <Button
                  label="Compare Mons Mouton vs Shackleton"
                  size="lg"
                  variant="secondary"
                  onClick={loadPolarRidgeComparison}
                />
                <Button
                  label="Compare 2-week launch slip"
                  size="lg"
                  variant="ghost"
                  onClick={loadLaunchSlipDemo}
                />
              </HStack>

              <Stack width="100%">
                <MoonHeroCanvas
                  variant="hero"
                  height={isWide ? 430 : 270}
                  phaseDeg={activeStage.phaseDeg}
                  focusLatDeg={activeStage.focusLatDeg}
                  focusLonDeg={activeStage.focusLonDeg}
                />
              </Stack>
            </VStack>
          </div>

          {/* 3. Bento Grid / Features Section (4 cards) */}
          <Stack id="landing-features">
            <VStack gap={4}>
              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Token label="Mission planning suite" size="sm" color="orange" />
                </HStack>
                <Heading level={2}>
                  Built for polar terrain, grazing illumination, and computed visibility
                </Heading>
              </VStack>

              <Grid columns={isWide ? 2 : 1} gap={4}>
                <Card padding={5}>
                  <VStack gap={2}>
                    <HStack gap={1.5} vAlign="center">
                      <Token label="3D + 2D" size="sm" color="orange" />
                      <Text type="label" weight="medium">
                        Interactive 3D LOLA terrain & sky view
                      </Text>
                    </HStack>
                    <Text type="body">
                      20×20 km terrain patches built from LOLA elevation data and 3,600-azimuth
                      horizon profiles, with Orbit and Lander POV cameras, Sun and Earth sightline
                      beams, and ridge occlusion markers.
                    </Text>
                  </VStack>
                </Card>

                <Card padding={5}>
                  <VStack gap={2}>
                    <HStack gap={1.5} vAlign="center">
                      <Token label="DTE + DSN" size="sm" color="blue" />
                      <Text type="label" weight="medium">
                        Plain-language status & DSN visibility
                      </Text>
                    </HStack>
                    <Text type="body">
                      Replaces raw angle charts with plain-language status readouts, the Earth
                      phase, and Moon visibility from the Goldstone, Madrid, and Canberra Deep Space
                      Network stations.
                    </Text>
                  </VStack>
                </Card>

                <Card padding={5}>
                  <VStack gap={2}>
                    <HStack gap={1.5} vAlign="center">
                      <Token label="Up to 4 sites" size="sm" color="gray" />
                      <Text type="label" weight="medium">
                        Schedule-slip & 4-site comparison
                      </Text>
                    </HStack>
                    <Text type="body">
                      Compare up to four candidate sites or launch dates side-by-side, or scan all
                      365 days on the Landing Calendar to find the next good window.
                    </Text>
                  </VStack>
                </Card>

                <Card padding={5}>
                  <VStack gap={2}>
                    <HStack gap={1.5} vAlign="center">
                      <Token label="10° tilt + PSR" size="sm" color="orange" />
                      <Text type="label" weight="medium">
                        Landing ellipse, tip-over & PSR overlays
                      </Text>
                    </HStack>
                    <Text type="body">
                      Test a 2 km landing-ellipse robustness band, 10° lander tip-over resilience, descent
                      approach glare, 20 km nearby heatmaps, and Permanently Shadowed Regions.
                    </Text>
                  </VStack>
                </Card>
              </Grid>
            </VStack>
          </Stack>

          {/* 4. Interactive Moon Phase & Mission Lighting Showcase */}
          <Stack id="landing-showcase">
            <Card padding={5}>
              <Grid columns={isWide ? 2 : 1} gap={5}>
                <VStack gap={3}>
                  <VStack gap={1.5}>
                    <HStack gap={1.5} vAlign="center">
                      <Token label="Interactive 3D lighting" size="sm" color="blue" />
                    </HStack>
                    <Heading level={2}>
                      Explore how solar phase and mountain ridges shape a mission
                    </Heading>
                    <Text type="supporting" size="sm">
                      Select a mission stage to rotate the 3D Moon illumination and preview the
                      scenario before opening it in the workspace:
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

                  <VStack gap={2}>
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
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <Button
                        label={activeStage.ctaLabel}
                        size="lg"
                        variant="primary"
                        onClick={() => enterPlanner(activeStage.scenarios)}
                      />
                    </HStack>
                  </VStack>
                </VStack>

                <Stack width="100%">
                  <MoonHeroCanvas
                    variant="showcase"
                    height={isWide ? 300 : 220}
                    phaseDeg={activeStage.phaseDeg}
                    focusLatDeg={activeStage.focusLatDeg}
                    focusLonDeg={activeStage.focusLonDeg}
                  />
                </Stack>
              </Grid>
            </Card>
          </Stack>

          {/* 5. Minimal Footer & Final CTA with Soft Lunar Horizon Glow */}
          <VStack gap={4} hAlign="center">
            <VStack gap={1.5} hAlign="center">
              <Heading level={2}>Ready to simulate a lunar landing window?</Heading>
              <Text type="supporting" size="sm">
                Launch directly into the 3D planner or pick a curated mission comparison below:
              </Text>
            </VStack>

            <HStack gap={2} vAlign="center" hAlign="center" wrap="wrap">
              <Button
                label="Enter 3D mission planner"
                size="lg"
                variant="primary"
                onClick={() => enterPlanner()}
              />
              <Button
                label="Compare 2-week launch slip"
                size="lg"
                variant="secondary"
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

            <Stack width="100%">
              <MoonHeroCanvas variant="horizon" height={150} />
            </Stack>
          </VStack>
        </VStack>
      </div>
    </div>
  );
}
