"use client";

import { useRef, type PointerEvent } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { DATA_BASE } from "../../lib/data/fetchers";
import type { Site } from "../../lib/data/sites";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { useCatalog } from "../../lib/useCatalog";
import {
  globalFromPixel,
  globalToPixel,
  scaleBar,
  SOUTH_RADIUS_M,
  southFromPixel,
  southToPixel,
  type Point,
} from "./projection";

export type MapMode = "south" | "global";

/** SVG user units. The images are drawn into this box, so pins keep one on-screen size at either zoom. */
const VIEW_W = 400;
const GLOBAL_H = 200;
const SOUTH_SRC = `${DATA_BASE}basemaps/south-pole-2048.webp`;
const GLOBAL_SRC = `${DATA_BASE}basemaps/global-2048.webp`;
const GLOBAL_KM_PER_DEG = 30.3;
const HIT_RADIUS = 9;
const PIN_R = 9;
const DOT_R = 2.5;
const BAR_MAX = 90;
const MARGIN = 8;

const INK = "var(--color-text-primary)";
const CARD = "var(--color-background-card)";

/** Distinct outline per scenario index, so the letter is not the only cue. */
function Glyph({ index, r }: { index: number; r: number }) {
  switch (index % 4) {
    case 0:
      return <circle r={r} />;
    case 1:
      return <rect x={-r} y={-r} width={2 * r} height={2 * r} />;
    case 2:
      return <polygon points={`0,${-r * 1.2} ${r * 1.1},${r * 0.9} ${-r * 1.1},${r * 0.9}`} />;
    default:
      return <polygon points={`0,${-r * 1.3} ${r * 1.3},0 0,${r * 1.3} ${-r * 1.3},0`} />;
  }
}

interface MapPickerProps {
  scenarioKey: string;
  mode: MapMode;
}

/** Basemap with a pin per catalogue site and per scenario. A click sets a custom point, or picks the pin it lands on. */
export function MapPicker({ scenarioKey, mode }: MapPickerProps) {
  const scenarios = useAppStore((s) => s.scenarios);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const catalog = useCatalog();
  const ref = useRef<SVGSVGElement>(null);
  const south = mode === "south";
  const h = south ? VIEW_W : GLOBAL_H;

  const toPixel = (lat: number, lon: number): Point | null =>
    south ? southToPixel(lat, lon, VIEW_W) : globalToPixel(lat, lon, VIEW_W, GLOBAL_H);

  const siteOf = (ref: SiteRef): { lat: number; lon: number } | null => {
    if (ref.kind === "custom") return ref;
    const s = catalog?.byId.get(ref.id);
    return s ? { lat: s.lat, lon: s.lon } : null;
  };

  const sitePins: { site: Site; p: Point }[] = (catalog?.sites ?? []).flatMap((site) => {
    const p = toPixel(site.lat, site.lon);
    return p ? [{ site, p }] : [];
  });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const x = ((e.clientX - box.left) / box.width) * VIEW_W;
    const y = ((e.clientY - box.top) / box.height) * h;
    let best: { site: Site; d: number } | null = null;
    for (const { site, p } of sitePins) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { site, d };
    }
    if (best) {
      updateScenario(scenarioKey, { site: { kind: "catalog", id: best.site.id } });
      return;
    }
    const ll = south ? southFromPixel(x, y, VIEW_W) : globalFromPixel(x, y, VIEW_W, GLOBAL_H);
    const lat = Math.round(ll.lat * 1000) / 1000 + 0;
    const lon = Math.round(ll.lon * 1000) / 1000 + 0;
    updateScenario(scenarioKey, { site: { kind: "custom", lat, lon } });
  };

  const metresPerUnit = south ? (2 * SOUTH_RADIUS_M) / VIEW_W : (GLOBAL_KM_PER_DEG * 1000 * 360) / VIEW_W;
  const bar = scaleBar(metresPerUnit, BAR_MAX);
  const barY = h - MARGIN;

  return (
    <Stack gap={2}>
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_W} ${h}`}
        width="100%"
        role="img"
        aria-label={south ? "South polar map" : "Map of the whole Moon"}
        aria-describedby="map-help"
        onPointerDown={onPointerDown}
        style={{ display: "block", cursor: "crosshair", touchAction: "manipulation", background: CARD }}
        data-testid={`map-${mode}`}
        data-mode={mode}
      >
        <image
          href={south ? SOUTH_SRC : GLOBAL_SRC}
          x={0}
          y={0}
          width={VIEW_W}
          height={h}
          preserveAspectRatio="none"
        />
        {sitePins.map(({ site, p }) => (
          <circle key={site.id} cx={p.x} cy={p.y} r={DOT_R} style={{ fill: INK, stroke: CARD, strokeWidth: 1 }}>
            <title>{site.name}</title>
          </circle>
        ))}
        {scenarios.map((sc, i) => {
          const ll = siteOf(sc.site);
          const p = ll ? toPixel(ll.lat, ll.lon) : null;
          if (!p) return null;
          const selected = sc.key === scenarioKey;
          const letter = sc.key.toUpperCase();
          return (
            <g key={sc.key} transform={`translate(${p.x} ${p.y})`} data-testid={`pin-${sc.key}`}>
              <g style={{ fill: CARD, stroke: INK, strokeWidth: selected ? 2.5 : 1.5 }}>
                <Glyph index={i} r={PIN_R} />
              </g>
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y={i % 4 === 2 ? 2 : 0}
                style={{ fill: INK, fontSize: 10, fontWeight: 500, pointerEvents: "none" }}
              >
                {letter}
              </text>
              <title>{`Scenario ${letter}`}</title>
            </g>
          );
        })}
        <g data-testid="scale-bar" style={{ pointerEvents: "none" }}>
          <rect
            x={MARGIN - 4}
            y={barY - 18}
            width={BAR_MAX + 8}
            height={26}
            style={{ fill: CARD, opacity: 0.85 }}
          />
          <line x1={MARGIN} x2={MARGIN + bar.px} y1={barY} y2={barY} style={{ stroke: INK, strokeWidth: 1.5 }} />
          <line x1={MARGIN} x2={MARGIN} y1={barY - 3} y2={barY + 3} style={{ stroke: INK, strokeWidth: 1.5 }} />
          <line
            x1={MARGIN + bar.px}
            x2={MARGIN + bar.px}
            y1={barY - 3}
            y2={barY + 3}
            style={{ stroke: INK, strokeWidth: 1.5 }}
          />
          <text x={MARGIN} y={barY - 6} style={{ fill: INK, fontSize: 9 }}>
            {south ? bar.label : `${bar.label} at the equator`}
          </text>
        </g>
      </svg>
      <Text type="supporting" size="xsm" id="map-help">
        {south
          ? "North is up and 0° E at the top. Click for a custom point, or a dot for a catalogue site."
          : "Click for a custom point, or a dot for a catalogue site."}
      </Text>
    </Stack>
  );
}
