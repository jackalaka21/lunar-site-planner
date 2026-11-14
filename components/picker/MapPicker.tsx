"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { browserFetcher, DATA_BASE, fetchJson } from "../../lib/data/fetchers";
import type { Site } from "../../lib/data/sites";
import { getEngine } from "../../lib/engineClient";
import { MAX_SCENARIOS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { useCatalog } from "../../lib/useCatalog";
import {
  DEFAULT_HEATMAP_RADIUS_KM,
  projectHeatmapCells,
  projectPsrPolygons,
  type HeatmapPoint,
  type PsrOverlayData,
} from "./heatmapModel";
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
const HEATMAP_CELL = 3.2;
const BAR_MAX = 90;
const MARGIN = 8;

const INK = "var(--color-text-primary)";
const CARD = "var(--color-background-card)";
const DEEPEST = "var(--surface-deepest)";

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

interface DragState {
  key: string;
  moved: boolean;
  pending: { lat: number; lon: number } | null;
  rafId: number | null;
}

/** Basemap with a pin per catalogue site and per scenario. Supports live pin drag, 20 km heatmap, and PSR overlay. */
export function MapPicker({ scenarioKey, mode }: MapPickerProps) {
  const scenarios = useAppStore((s) => s.scenarios);
  const settings = useAppStore((s) => s.settings);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const catalog = useCatalog();
  const ref = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [showPsr, setShowPsr] = useState(false);
  const [psrData, setPsrData] = useState<PsrOverlayData | null>(null);

  const south = mode === "south";
  const h = south ? VIEW_W : GLOBAL_H;
  const activeScenario = scenarios.find((s) => s.key === scenarioKey) ?? scenarios[0];

  const toPixel = (lat: number, lon: number): Point | null =>
    south ? southToPixel(lat, lon, VIEW_W) : globalToPixel(lat, lon, VIEW_W, GLOBAL_H);

  const siteOf = (siteRef: SiteRef): { lat: number; lon: number } | null => {
    if (siteRef.kind === "custom") return siteRef;
    const s = catalog?.byId.get(siteRef.id);
    return s ? { lat: s.lat, lon: s.lon } : null;
  };

  const activeCoords = activeScenario ? siteOf(activeScenario.site) : null;

  useEffect(() => {
    return () => {
      if (dragRef.current?.rafId != null) {
        cancelAnimationFrame(dragRef.current.rafId);
      }
    };
  }, []);

  useEffect(() => {
    if (!south || !showPsr || psrData) return;
    let cancelled = false;
    fetchJson<PsrOverlayData>(browserFetcher, "overlays/psr.json")
      .then((data) => {
        if (!cancelled) setPsrData(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [south, showPsr, psrData]);

  useEffect(() => {
    if (!south || !showHeatmap || !activeScenario) return;
    let cancelled = false;
    getEngine()
      .heatmap({
        ref: activeScenario.site,
        t0Ms: activeScenario.t0Ms,
        radiusKm: DEFAULT_HEATMAP_RADIUS_KM,
        settings,
      })
      .then((pts) => {
        if (!cancelled) setHeatmapPoints(pts);
      })
      .catch(() => {
        if (!cancelled) setHeatmapPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [south, showHeatmap, activeScenario, settings]);

  const heatmapCells = useMemo(() => {
    if (!south || !showHeatmap || !activeCoords) return [];
    return projectHeatmapCells(
      heatmapPoints,
      activeCoords.lat,
      activeCoords.lon,
      settings.durationDays * 24,
      VIEW_W,
      DEFAULT_HEATMAP_RADIUS_KM,
    );
  }, [south, showHeatmap, activeCoords, heatmapPoints, settings.durationDays]);

  const psrPolygons = useMemo(
    () => (south && showPsr && psrData ? projectPsrPolygons(psrData.features, VIEW_W) : []),
    [south, showPsr, psrData],
  );

  const sitePins: { site: Site; p: Point }[] = (catalog?.sites ?? []).flatMap((site) => {
    const p = toPixel(site.lat, site.lon);
    return p ? [{ site, p }] : [];
  });

  const coordsAt = (clientX: number, clientY: number): { x: number; y: number; lat: number; lon: number } | null => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const x = Math.max(0, Math.min(VIEW_W, ((clientX - box.left) / box.width) * VIEW_W));
    const y = Math.max(0, Math.min(h, ((clientY - box.top) / box.height) * h));
    const ll = south ? southFromPixel(x, y, VIEW_W) : globalFromPixel(x, y, VIEW_W, GLOBAL_H);
    const lat = Math.round(ll.lat * 1000) / 1000 + 0;
    const lon = Math.round(ll.lon * 1000) / 1000 + 0;
    return { x, y, lat, lon };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const pos = coordsAt(e.clientX, e.clientY);
    if (!pos) return;
    const { x, y, lat, lon } = pos;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic pointer events may not have an active pointerId.
    }

    const targetPinEl = (e.target as Element | null)?.closest?.("[data-pin-key]");
    let pinKey = targetPinEl?.getAttribute("data-pin-key") ?? null;
    if (!pinKey) {
      const ordered = [...scenarios].sort((a, b) => (a.key === scenarioKey ? -1 : b.key === scenarioKey ? 1 : 0));
      for (const sc of ordered) {
        const ll = siteOf(sc.site);
        const p = ll ? toPixel(ll.lat, ll.lon) : null;
        if (p && Math.hypot(p.x - x, p.y - y) <= PIN_R + 3) {
          pinKey = sc.key;
          break;
        }
      }
    }

    if (pinKey) {
      dragRef.current = { key: pinKey, moved: false, pending: null, rafId: null };
      return;
    }

    let best: { site: Site; d: number } | null = null;
    for (const { site, p } of sitePins) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= HIT_RADIUS && (!best || d < best.d)) best = { site, d };
    }
    if (best) {
      updateScenario(scenarioKey, { site: { kind: "catalog", id: best.site.id } });
      dragRef.current = { key: scenarioKey, moved: false, pending: null, rafId: null };
      return;
    }

    updateScenario(scenarioKey, { site: { kind: "custom", lat, lon } });
    dragRef.current = { key: scenarioKey, moved: false, pending: null, rafId: null };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = coordsAt(e.clientX, e.clientY);
    if (!pos) return;
    drag.moved = true;
    drag.pending = { lat: pos.lat, lon: pos.lon };
    if (drag.rafId === null) {
      drag.rafId = requestAnimationFrame(() => {
        const cur = dragRef.current;
        if (!cur) return;
        cur.rafId = null;
        if (cur.pending) {
          const next = cur.pending;
          cur.pending = null;
          updateScenario(cur.key, { site: { kind: "custom", lat: next.lat, lon: next.lon } });
        }
      });
    }
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.rafId !== null) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = null;
    }
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    if (drag.moved) {
      const pos = coordsAt(e.clientX, e.clientY);
      const finalCoords = pos ? { lat: pos.lat, lon: pos.lon } : drag.pending;
      if (finalCoords) {
        updateScenario(drag.key, { site: { kind: "custom", lat: finalCoords.lat, lon: finalCoords.lon } });
      }
    }
  };

  const pickHeatmapPoint = (rawLat: number, rawLon: number) => {
    const lat = Math.round(rawLat * 1000) / 1000 + 0;
    const lon = Math.round(rawLon * 1000) / 1000 + 0;
    if (scenarios.length < MAX_SCENARIOS && activeScenario) {
      addScenario({ site: { kind: "custom", lat, lon }, t0Ms: activeScenario.t0Ms });
    } else {
      updateScenario(scenarioKey, { site: { kind: "custom", lat, lon } });
    }
  };

  const metresPerUnit = south ? (2 * SOUTH_RADIUS_M) / VIEW_W : (GLOBAL_KM_PER_DEG * 1000 * 360) / VIEW_W;
  const bar = scaleBar(metresPerUnit, BAR_MAX);
  const barY = h - MARGIN;

  return (
    <Stack gap={2}>
      {south ? (
        <HStack gap={1.5} wrap="wrap">
          <Button
            label="Nearby heatmap (20 km)"
            size="lg"
            variant={showHeatmap ? "secondary" : "ghost"}
            aria-pressed={showHeatmap}
            onClick={() => setShowHeatmap((v) => !v)}
          />
          <Button
            label="Permanent shadow (PSR)"
            size="lg"
            variant={showPsr ? "secondary" : "ghost"}
            aria-pressed={showPsr}
            onClick={() => setShowPsr((v) => !v)}
          />
        </HStack>
      ) : null}
      <svg
        ref={ref}
        viewBox={`0 0 ${VIEW_W} ${h}`}
        width="100%"
        role="img"
        aria-label={south ? "South polar map" : "Map of the whole Moon"}
        aria-describedby="map-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ display: "block", cursor: "crosshair", touchAction: "none", background: CARD }}
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
        {south && showPsr ? (
          <g data-testid="psr-layer" style={{ pointerEvents: "none" }}>
            {psrPolygons.map((poly) => (
              <path
                key={poly.id}
                d={poly.d}
                fillRule="evenodd"
                data-testid={`psr-polygon-${poly.id}`}
                style={{
                  fill: DEEPEST,
                  fillOpacity: 0.65,
                  stroke: INK,
                  strokeWidth: 1,
                  strokeDasharray: "2 2",
                }}
              >
                <title>{poly.name}</title>
              </path>
            ))}
          </g>
        ) : null}
        {south && showHeatmap ? (
          <g data-testid="heatmap-layer">
            {heatmapCells.map((cell, idx) => (
              <rect
                key={`${cell.lat}:${cell.lon}`}
                x={cell.x - HEATMAP_CELL / 2}
                y={cell.y - HEATMAP_CELL / 2}
                width={HEATMAP_CELL}
                height={HEATMAP_CELL}
                rx={0.5}
                data-testid={`heatmap-point-${idx}`}
                data-step={cell.step}
                data-both-h={Math.round(cell.bothH)}
                data-lat={cell.lat}
                data-lon={cell.lon}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  pickHeatmapPoint(cell.lat, cell.lon);
                }}
                style={{
                  fill: cell.fill,
                  stroke: INK,
                  strokeWidth: 0.25,
                  cursor: "pointer",
                }}
              >
                <title>{`${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°: ${Math.round(cell.bothH)} h`}</title>
              </rect>
            ))}
          </g>
        ) : null}
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
            <g
              key={sc.key}
              transform={`translate(${p.x} ${p.y})`}
              data-testid={`pin-${sc.key}`}
              data-pin-key={sc.key}
              style={{ cursor: "grab" }}
            >
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
          ? `North is up and 0° E at the top. Click or drag a pin for a custom point, or click a dot for a catalogue site.${
              showPsr ? " Zero average sunlight over the 18.6-yr illumination model, NASA PGDA 120 m (Mazarico et al. 2011). Regions under 1 km² omitted." : ""
            }`
          : "Click or drag a pin for a custom point, or click a dot for a catalogue site."}
      </Text>
    </Stack>
  );
}
