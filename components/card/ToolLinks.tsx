"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

/*
 * Deep-link formats, checked 14 Nov 2026 (web search and a fetch of each landing page).
 * - Quickmap (https://quickmap.lroc.asu.edu/, redirects to https://quickmap.lroc.im-ldi.com/): the app is
 *   script-driven and exposes no documented centre-on-lat/lon query parameter; its Permalink feature makes
 *   opaque short URLs. No stable deep link, so link to the home page and show the coordinates.
 * - Moon Trek (https://trek.nasa.gov/moon/): views are shareable as app-generated URLs, but no documented
 *   lat/lon centring parameter was found. Same fallback.
 * - JPL Horizons (https://ssd.jpl.nasa.gov/horizons/app.html): the web app takes no site coordinates in the
 *   URL. Link to the app with a note on the Observer settings.
 */
const QUICKMAP_HOME = "https://quickmap.lroc.asu.edu/";
const MOON_TREK_HOME = "https://trek.nasa.gov/moon/";
const HORIZONS_APP = "https://ssd.jpl.nasa.gov/horizons/app.html";

export interface ToolLinksProps {
  lat: number;
  lon: number;
}

export function toolLinks(lat: number, lon: number) {
  const coords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  return [
    { label: "Open in Quickmap", href: QUICKMAP_HOME, note: `Search for ${coords}` },
    { label: "Open in Moon Trek", href: MOON_TREK_HOME, note: `Search for ${coords}` },
    { label: "Check in JPL Horizons", href: HORIZONS_APP, note: `Use Observer, center coord@301, site ${coords}` },
  ];
}

export function ToolLinks({ lat, lon }: ToolLinksProps) {
  return (
    <VStack gap={2}>
      {toolLinks(lat, lon).map((l) => (
        <HStack key={l.label} gap={2} vAlign="center" wrap="wrap">
          <Link href={l.href} target="_blank" rel="noopener noreferrer" isExternalLink>
            {l.label}
          </Link>
          <Text type="supporting" size="xsm">
            {l.note}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}
