import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { fmtHours } from "../../lib/engine/format";
import type { Metrics } from "../../lib/engine/metrics";
import type { HorizonSource } from "../../lib/engine/types";
import prerender from "../../public/data/v1/prerender/default.json";
import {
  CONTROLS_RESERVE_REM,
  PHONE_BREAKPOINT_REM,
  STATUS_ROW_RESERVE_REM,
  VIEWPORT_HEIGHT_REM,
} from "../terrain3d/viewport";
import { MissionClock } from "../ui/MissionClock";
import { Term } from "../ui/Term";
import { MetricsBar } from "./MetricsBar";
import { Provenance } from "./Provenance";
import { StaticCardActions } from "./StaticCardActions";
import { VerdictChip } from "./VerdictChip";
import { formatSpan } from "./delta";

/**
 * Same height as the live card's default 3D viewport (520 single card desktop, 340 phone, see
 * terrain3d/viewport.ts) plus the control bar under it, so hydration causes no layout jump.
 */
const PHONE_QUERY = `(max-width: ${PHONE_BREAKPOINT_REM}rem)`;
const placeholderCss =
  `[data-testid="static-panorama"]{height:${VIEWPORT_HEIGHT_REM.single + CONTROLS_RESERVE_REM.desktop + STATUS_ROW_RESERVE_REM.desktop}rem}` +
  `@media ${PHONE_QUERY}{[data-testid="static-panorama"]{height:${VIEWPORT_HEIGHT_REM.phone + CONTROLS_RESERVE_REM.phone + STATUS_ROW_RESERVE_REM.phone}rem}}`;
/** Timeline viewBox, so the placeholder keeps the live timeline's aspect ratio. */
const TIMELINE_VIEWBOX = "0 0 1000 124";
const NONE_WITHIN = "> 60 d";

interface Countdowns {
  sunset: number | null;
  sunrise: number | null;
  earthset: number | null;
  earthrise: number | null;
}

/**
 * The default scenario's first card, drawn in the server HTML from the build-time prerender
 * (scripts/prerender-default.ts). It has the live card's header, headline numbers and spacing; the panorama and
 * timeline are blank boxes of the same size until the live card replaces it. It ships no client code of its own.
 */
export function StaticDefaultCard() {
  const p = prerender;
  const metrics = p.metrics as unknown as Metrics;
  const countdowns = p.countdowns as Countdowns;
  const s = p.series;
  const letter = p.scenario.key.toUpperCase();
  const cursorMs = s.t0Ms;
  const sunLit = s.lit[0] === 1;
  const earthUp = s.earthIn[0] === 1;
  const span = (at: number | null) => (at === null ? NONE_WITHIN : formatSpan(at - cursorMs));
  const earthNever = metrics.earthH === 0;

  return (
    <Card padding={5} data-testid={`scenario-card-${p.scenario.key}`} data-prerendered="true">
      <VStack gap={5}>
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <VStack gap={0.5}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Token label={letter} size="sm" color="gray" description={`Scenario ${letter}`} />
              <Text type="label" weight="medium">
                {p.name}
              </Text>
              <Text type="supporting">{p.groupTag}</Text>
            </HStack>
            <HStack gap={1.5} vAlign="center" wrap="wrap">
              <Text type="supporting" size="xsm">
                Landing
              </Text>
              <MissionClock ms={p.scenario.t0Ms} axis="cal" tz="UTC" />
              <Text type="supporting" size="xsm">
                Cursor
              </Text>
              <MissionClock ms={0} axis="met" tz="UTC" />
            </HStack>
          </VStack>
          <HStack gap={1} vAlign="center">
            <VerdictChip verdict={metrics.verdict} reason={metrics.reason} />
            <StaticCardActions letter={letter} />
          </HStack>
        </HStack>

        <MetricsBar
          both={fmtHours(metrics.bothH)}
          sun={{
            label: (
              <Term id={sunLit ? "sunset" : "sunrise"}>{sunLit ? "Sunset in" : "Sunrise in"}</Term>
            ),
            value: span(sunLit ? countdowns.sunset : countdowns.sunrise),
          }}
          earth={
            earthNever
              ? { value: "Earth never in view" }
              : {
                  label: (
                    <Term id={earthUp ? "earthset" : "earthrise"}>
                      {earthUp ? "Earthset in" : "Earthrise in"}
                    </Term>
                  ),
                  value: span(earthUp ? countdowns.earthset : countdowns.earthrise),
                }
          }
          sunEl={{
            label: <Term id="elevation">Sun elevation now</Term>,
            value: `${s.sunEl[0].toFixed(1)}°`,
          }}
        />

        <style>{placeholderCss}</style>
        <Stack aria-hidden="true" data-testid="static-panorama" />
        <svg
          viewBox={TIMELINE_VIEWBOX}
          width="100%"
          style={{ display: "block" }}
          aria-hidden="true"
        />

        <Provenance ctx={{ source: p.ctx.source as HorizonSource }} />
      </VStack>
    </Card>
  );
}
