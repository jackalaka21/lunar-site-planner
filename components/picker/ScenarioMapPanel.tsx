"use client";

import { useEffect, useRef, useState } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Stack } from "@astryxdesign/core/Stack";
import { useAppStore } from "../../lib/state/store";
import { MapPicker, type MapMode } from "./MapPicker";

const PHONE_QUERY = "(max-width: 47.99rem)";
const DESKTOP_HEIGHT = "30rem";
const PHONE_HEIGHT = "22.5rem";
/** Start loading the basemap when the panel is within this distance of the viewport (percentages of the viewport). */
const NEAR_MARGIN = "100% 0% 100% 0%";

/**
 * The large scenario map, below the 3D render and the cards. The scenario selector chooses which scenario the
 * pin edits; clicks and pin drags go straight to the store, so the left panel coordinate fields follow.
 */
export function ScenarioMapPanel() {
  const scenarios = useAppStore((s) => s.scenarios);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [picked, setPicked] = useState("a");
  const [mode, setMode] = useState<MapMode>("south");
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const wrapRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  const active = scenarios.some((s) => s.key === picked) ? picked : (scenarios[0]?.key ?? "a");
  const height = isPhone ? PHONE_HEIGHT : DESKTOP_HEIGHT;

  return (
    <Stack
      gap={3}
      ref={wrapRef}
      id="scenario-map"
      data-testid="scenario-map"
      data-tour-id="tour-map"
    >
      <HStack gap={3} wrap="wrap" align="center">
        <Heading level={2}>Scenario map</Heading>
        <SegmentedControl
          label="Map view"
          size="lg"
          value={mode}
          onChange={(v) => setMode(v === "global" ? "global" : "south")}
        >
          <SegmentedControlItem value="south" label="South pole" />
          <SegmentedControlItem value="global" label="Whole Moon" />
        </SegmentedControl>
        {scenarios.length >= 2 ? (
          <SegmentedControl
            label="Scenario the pin edits"
            size="lg"
            value={active}
            onChange={setPicked}
          >
            {scenarios.map((s) => (
              <SegmentedControlItem key={s.key} value={s.key} label={s.key.toUpperCase()} />
            ))}
          </SegmentedControl>
        ) : null}
      </HStack>
      {near ? (
        <MapPicker key={mode} scenarioKey={active} mode={mode} height={height} />
      ) : (
        <Stack style={{ minHeight: `calc(${height} + 7rem)` }} />
      )}
    </Stack>
  );
}
