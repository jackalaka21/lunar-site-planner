"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { browserFetcher, DATA_BASE, fetchJson } from "../../lib/data/fetchers";
import type { Site } from "../../lib/data/sites";
import { getEngine } from "../../lib/engineClient";
import { MAX_SCENARIOS } from "../../lib/state/defaults";
import { useAppStore } from "../../lib/state/store";
import type { SiteRef } from "../../lib/state/url";
import { useCatalog } from "../../lib/useCatalog";
import {
  DEFAULT_HEATMAP_RADIUS_KM,
  HEATMAP_FILL_OPACITY,
  HEATMAP_GRID_SPACING_M,
  heatmapLegend,
  projectHeatmapCells,
  projectPsrPolygons,
  type HeatmapPoint,
  type ProjectedHeatmapCell,
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
import {
  clampView,
  clampZoom,
  easeInOut,
  homeView,
  lerpView,
  MAX_ZOOM,
  MIN_ZOOM,
  viewBoxOf,
  zoomAbout,
  zoomForSpan,
  type MapView,
} from "./projectionView";

export type MapMode = "south" | "global";

/** SVG user units of the base image (zoom 1). Pins, dots, strokes and the scale bar are drawn in screen units. */
const VIEW_W = 400;
const GLOBAL_H = 200;
const SOUTH_SRC = `${DATA_BASE}basemaps/south-pole-2048.webp`;
const GLOBAL_SRC = `${DATA_BASE}basemaps/global-2048.webp`;
const GLOBAL_KM_PER_DEG = 30.3;
/** Screen-size constants. A group scaled by user-units-per-screen-pixel draws them at one size at every zoom. */
const PIN_R = 14;
const PIN_HIT = 22;
const DOT_R = 3.5;
const DOT_HIT = 12;
const BAR_MAX = 140;
const MARGIN = 12;
const PAN_THRESHOLD = 5;
const ANIM_MS = 450;
const WHEEL_SPEED = 0.0015;
const WHEEL_LINE = 0.05;
const BUTTON_FACTOR = 1.6;
const KEY_PAN = 0.12;
/** The Nearby heatmap auto-zooms to a box of this width: 20 km radius plus a 6 km margin each side. */
const AUTO_ZOOM_SPAN_KM = 52;
/** Wait this long after the site stops changing before asking the engine for a heatmap. */
const HEATMAP_DEBOUNCE_MS = 250;

const KEYBOARD_HELP =
  "With the map focused, arrow keys pan, + and − zoom, 0 resets. Type coordinates in the Latitude and Longitude fields to place a point by keyboard.";
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
  /** Height of the map area as a CSS length. Without it the map keeps the basemap aspect ratio. */
  height?: string;
}

interface DragState {
  key: string;
  moved: boolean;
  pending: { lat: number; lon: number } | null;
  rafId: number | null;
}

interface PanState {
  sx: number;
  sy: number;
  view0: MapView;
  moved: boolean;
  onCell: boolean;
}

interface PinchState {
  prevD: number;
  prevMx: number;
  prevMy: number;
}

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Basemap with a pin per catalogue site and per scenario. Pin drag, 20 km heatmap, PSR overlay, zoom and pan. */
export function MapPicker({ scenarioKey, mode, height }: MapPickerProps) {
  const scenarios = useAppStore((s) => s.scenarios);
  const settings = useAppStore((s) => s.settings);
  const updateScenario = useAppStore((s) => s.updateScenario);
  const addScenario = useAppStore((s) => s.addScenario);
  const catalog = useCatalog();
  const ref = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const animRef = useRef<number | null>(null);
  const userMovedRef = useRef(false);
  const autoZoomedRef = useRef(false);
  const preAutoViewRef = useRef<MapView | null>(null);
  const lastPointerTypeRef = useRef("mouse");

  const south = mode === "south";
  const h = south ? VIEW_W : GLOBAL_H;

  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [showPsr, setShowPsr] = useState(false);
  const [psrData, setPsrData] = useState<PsrOverlayData | null>(null);
  const [hover, setHover] = useState<ProjectedHeatmapCell | null>(null);
  const [view, setView] = useState<MapView>(() => homeView(VIEW_W, h));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const viewRef = useRef(view);
  const aspect = size && size.h > 0 ? size.w / size.h : VIEW_W / h;
  const aspectRef = useRef(aspect);
  useEffect(() => {
    aspectRef.current = aspect;
  }, [aspect]);
  const screenW = size?.w ?? VIEW_W;
  const vb = viewBoxOf(view, VIEW_W, h, aspect);
  /** User units per screen pixel: sizes in screen pixels times this stay constant on screen at any zoom. */
  const pxu = vb.w / screenW;

  const applyView = (next: MapView) => {
    viewRef.current = next;
    setView(next);
  };
  const stopAnim = () => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };
  const animateTo = (target: MapView) => {
    stopAnim();
    const goal = clampView(target, VIEW_W, h, aspectRef.current);
    if (prefersReducedMotion()) {
      applyView(goal);
      return;
    }
    const from = viewRef.current;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const t = Math.min(1, (now - t0) / ANIM_MS);
      applyView(lerpView(from, goal, easeInOut(t)));
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
  };
  /** Any manual zoom or pan. Turning the heatmap off no longer zooms back out after this. */
  const userMoved = () => {
    userMovedRef.current = true;
    stopAnim();
  };

  const activeScenario = scenarios.find((s) => s.key === scenarioKey) ?? scenarios[0];

  const toPixel = (lat: number, lon: number): Point | null =>
    south ? southToPixel(lat, lon, VIEW_W) : globalToPixel(lat, lon, VIEW_W, GLOBAL_H);

  const siteOf = (siteRef: SiteRef): { lat: number; lon: number } | null => {
    if (siteRef.kind === "custom") return { lat: siteRef.lat, lon: siteRef.lon };
    const s = catalog?.byId.get(siteRef.id);
    return s ? { lat: s.lat, lon: s.lon } : null;
  };

  const activeCoords = activeScenario ? siteOf(activeScenario.site) : null;
  const activePixel = activeCoords ? toPixel(activeCoords.lat, activeCoords.lon) : null;

  const metresPerUnit = south
    ? (2 * SOUTH_RADIUS_M) / VIEW_W
    : (GLOBAL_KM_PER_DEG * 1000 * 360) / VIEW_W;

  useEffect(() => {
    return () => {
      if (dragRef.current?.rafId != null) cancelAnimationFrame(dragRef.current.rafId);
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Track the rendered size, so the viewBox matches the container and the map fills it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize((cur) =>
          cur && cur.w === r.width && cur.h === r.height ? cur : { w: r.width, h: r.height },
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wheel and trackpad zoom, centred on the pointer. A native listener, because React's wheel handler is passive.
  // preventDefault runs only while the map would actually zoom, so the page still scrolls at the zoom limits.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Only capture the wheel once the map is focused (click it) or on Ctrl/pinch, so the page still scrolls.
      if (!(e.ctrlKey || e.metaKey || document.activeElement === el)) return;
      const v = viewRef.current;
      const zoomingIn = e.deltaY < 0;
      if (e.deltaY === 0 || (zoomingIn && v.zoom >= MAX_ZOOM) || (!zoomingIn && v.zoom <= MIN_ZOOM))
        return;
      const box = el.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      e.preventDefault();
      userMovedRef.current = true;
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      const unit = e.deltaMode === 1 ? WHEEL_LINE : WHEEL_SPEED;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 3 : 1));
      const next = zoomAbout(
        v,
        factor,
        (e.clientX - box.left) / box.width,
        (e.clientY - box.top) / box.height,
        VIEW_W,
        h,
        aspectRef.current,
      );
      viewRef.current = next;
      setView(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [h]);

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

  const siteSig = activeScenario ? JSON.stringify(activeScenario.site) : null;
  const t0 = activeScenario?.t0Ms;
  useEffect(() => {
    if (!south || !showHeatmap || siteSig === null || t0 === undefined) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getEngine()
        .heatmap({
          ref: JSON.parse(siteSig) as SiteRef,
          t0Ms: t0,
          radiusKm: DEFAULT_HEATMAP_RADIUS_KM,
          settings,
        })
        .then((pts) => {
          if (!cancelled) setHeatmapPoints(pts);
        })
        .catch(() => {
          if (!cancelled) setHeatmapPoints([]);
        });
    }, HEATMAP_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [south, showHeatmap, siteSig, t0, settings]);

  const windowH = settings.durationDays * 24;
  // Looked up from the serialised site, so the memo below depends on plain numbers only.
  const activeLL = useMemo(() => {
    if (siteSig === null) return null;
    const r = JSON.parse(siteSig) as SiteRef;
    if (r.kind === "custom") return { lat: r.lat, lon: r.lon };
    const found = catalog?.byId.get(r.id);
    return found ? { lat: found.lat, lon: found.lon } : null;
  }, [siteSig, catalog]);
  const activeLat = activeLL ? activeLL.lat : null;
  const activeLon = activeLL ? activeLL.lon : null;
  const heatmapCells = useMemo(
    () =>
      south && showHeatmap && activeLat !== null && activeLon !== null
        ? projectHeatmapCells(
            heatmapPoints,
            activeLat,
            activeLon,
            windowH,
            VIEW_W,
            DEFAULT_HEATMAP_RADIUS_KM,
          )
        : [],
    [south, showHeatmap, activeLat, activeLon, heatmapPoints, windowH],
  );
  const legend = useMemo(() => heatmapLegend(windowH), [windowH]);
  /** One grid step in map units, so neighbouring cells tile with no gaps. */
  const cellSize = HEATMAP_GRID_SPACING_M / metresPerUnit;

  const psrPolygons = useMemo(
    () => (south && showPsr && psrData ? projectPsrPolygons(psrData.features, VIEW_W) : []),
    [south, showPsr, psrData],
  );

  const psrPaths = useMemo(
    () =>
      psrPolygons.map((poly) => (
        <path
          key={poly.id}
          d={poly.d}
          fillRule="evenodd"
          data-testid={`psr-polygon-${poly.id}`}
        >
          <title>{poly.name}</title>
        </path>
      )),
    [psrPolygons],
  );
  const heatRects = useMemo(
    () =>
      heatmapCells.map((cell, idx) => (
        <rect
          key={`${cell.lat}:${cell.lon}`}
          x={cell.x - cellSize / 2}
          y={cell.y - cellSize / 2}
          width={cellSize}
          height={cellSize}
          data-heat
          data-index={idx}
          data-testid={`heatmap-point-${idx}`}
          data-step={cell.step}
          data-both-h={Math.round(cell.bothH)}
          data-lat={cell.lat}
          data-lon={cell.lon}
          style={{
            fill: cell.fill,
            fillOpacity: HEATMAP_FILL_OPACITY,
            shapeRendering: "crispEdges",
            cursor: "pointer",
          }}
        >
          <title>{`${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°: ${Math.round(cell.bothH)} h Sun and Earth together`}</title>
        </rect>
      )),
    [heatmapCells, cellSize],
  );
  const cellOf = (target: EventTarget | null): ProjectedHeatmapCell | null => {
    const idx = (target as Element | null)?.closest?.("[data-index]")?.getAttribute("data-index");
    return idx == null ? null : (heatmapCells[Number(idx)] ?? null);
  };

  const sitePins: { site: Site; p: Point }[] = (catalog?.sites ?? []).flatMap((site) => {
    const p = toPixel(site.lat, site.lon);
    return p ? [{ site, p }] : [];
  });

  const coordsAt = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number; lat: number; lon: number; inside: boolean } | null => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    const rawX = vb.x + ((clientX - box.left) / box.width) * vb.w;
    const rawY = vb.y + ((clientY - box.top) / box.height) * vb.h;
    const x = Math.max(0, Math.min(VIEW_W, rawX));
    const y = Math.max(0, Math.min(h, rawY));
    const ll = south ? southFromPixel(x, y, VIEW_W) : globalFromPixel(x, y, VIEW_W, GLOBAL_H);
    const lat = Math.round(ll.lat * 1000) / 1000 + 0;
    const lon = Math.round(ll.lon * 1000) / 1000 + 0;
    return { x, y, lat, lon, inside: rawX >= 0 && rawX <= VIEW_W && rawY >= 0 && rawY <= h };
  };

  const capture = (e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic pointer events may not have an active pointerId.
    }
  };

  const releaseCapture = (e: PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  /** A click that did not become a pan: pick a catalogue dot if one is under the pointer, else drop a custom point. */
  const placeAt = (clientX: number, clientY: number) => {
    const pos = coordsAt(clientX, clientY);
    if (!pos || !pos.inside) return;
    let best: { site: Site; d: number } | null = null;
    for (const { site, p } of sitePins) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d <= DOT_HIT * pxu && (!best || d < best.d)) best = { site, d };
    }
    if (best) updateScenario(scenarioKey, { site: { kind: "catalog", id: best.site.id } });
    else updateScenario(scenarioKey, { site: { kind: "custom", lat: pos.lat, lon: pos.lon } });
  };

  const cancelPinDrag = () => {
    const drag = dragRef.current;
    if (drag?.rafId != null) cancelAnimationFrame(drag.rafId);
    dragRef.current = null;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    lastPointerTypeRef.current = e.pointerType || "mouse";
    ref.current?.focus({ preventScroll: true });
    pointersRef.current.set(e.pointerId ?? 0, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // Second finger: pinch zoom. Abandon any pin drag or pan in progress.
      cancelPinDrag();
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        prevD: Math.hypot(a.x - b.x, a.y - b.y),
        prevMx: (a.x + b.x) / 2,
        prevMy: (a.y + b.y) / 2,
      };
      userMoved();
      capture(e);
      return;
    }
    if (pointersRef.current.size > 2) return;

    const pos = coordsAt(e.clientX, e.clientY);
    if (!pos) return;
    const { x, y } = pos;

    const target = e.target as Element | null;
    const targetPinEl = target?.closest?.("[data-pin-key]");
    let pinKey = targetPinEl?.getAttribute("data-pin-key") ?? null;
    if (!pinKey) {
      const ordered = [...scenarios].sort((a, b) =>
        a.key === scenarioKey ? -1 : b.key === scenarioKey ? 1 : 0,
      );
      for (const sc of ordered) {
        const ll = siteOf(sc.site);
        const p = ll ? toPixel(ll.lat, ll.lon) : null;
        if (p && Math.hypot(p.x - x, p.y - y) <= PIN_HIT * pxu) {
          pinKey = sc.key;
          break;
        }
      }
    }

    if (pinKey) {
      capture(e);
      dragRef.current = { key: pinKey, moved: false, pending: null, rafId: null };
      return;
    }

    // Empty map: a still click places a point on release, a drag pans the map.
    panRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      view0: viewRef.current,
      moved: false,
      onCell: Boolean(target?.closest?.("[data-heat]")),
    };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const id = e.pointerId ?? 0;
    if (pointersRef.current.has(id)) pointersRef.current.set(id, { x: e.clientX, y: e.clientY });

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (pinch.prevD > 0 && d > 0) {
        const zoomed = zoomAbout(
          viewRef.current,
          d / pinch.prevD,
          (mx - box.left) / box.width,
          (my - box.top) / box.height,
          VIEW_W,
          h,
          aspectRef.current,
        );
        const zb = viewBoxOf(zoomed, VIEW_W, h, aspectRef.current);
        applyView(
          clampView(
            {
              ...zoomed,
              cx: zoomed.cx - ((mx - pinch.prevMx) / box.width) * zb.w,
              cy: zoomed.cy - ((my - pinch.prevMy) / box.height) * zb.h,
            },
            VIEW_W,
            h,
            aspectRef.current,
          ),
        );
      }
      pinch.prevD = d;
      pinch.prevMx = mx;
      pinch.prevMy = my;
      return;
    }

    const drag = dragRef.current;
    if (drag) {
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
      return;
    }

    const pan = panRef.current;
    if (!pan) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      panRef.current = null;
      return;
    }
    const dx = e.clientX - pan.sx;
    const dy = e.clientY - pan.sy;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      pan.moved = true;
      userMoved();
      capture(e);
    }
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    const b0 = viewBoxOf(pan.view0, VIEW_W, h, aspectRef.current);
    applyView(
      clampView(
        {
          ...pan.view0,
          cx: pan.view0.cx - (dx / box.width) * b0.w,
          cy: pan.view0.cy - (dy / box.height) * b0.h,
        },
        VIEW_W,
        h,
        aspectRef.current,
      ),
    );
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId ?? 0);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      panRef.current = null;
      releaseCapture(e);
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      if (drag.rafId !== null) {
        cancelAnimationFrame(drag.rafId);
        drag.rafId = null;
      }
      releaseCapture(e);
      if (drag.moved) {
        const pos = coordsAt(e.clientX, e.clientY);
        const finalCoords = pos ? { lat: pos.lat, lon: pos.lon } : drag.pending;
        if (finalCoords) {
          updateScenario(drag.key, {
            site: { kind: "custom", lat: finalCoords.lat, lon: finalCoords.lon },
          });
        }
      }
      return;
    }
    const pan = panRef.current;
    panRef.current = null;
    if (!pan) return;
    releaseCapture(e);
    if (!pan.moved && !pan.onCell) placeAt(e.clientX, e.clientY);
  };

  const onPointerCancel = (e: PointerEvent<SVGSVGElement>) => {
    // A cancelled gesture must not place a point, and a pin drag commits only its last move.
    panRef.current = null;
    pointersRef.current.delete(e.pointerId ?? 0);
    const drag = dragRef.current;
    if (drag) {
      cancelPinDrag();
      releaseCapture(e);
      if (drag.pending) {
        updateScenario(drag.key, {
          site: { kind: "custom", lat: drag.pending.lat, lon: drag.pending.lon },
        });
      }
      return;
    }
    onPointerUp(e);
  };

  const zoomBy = (factor: number) => {
    userMoved();
    applyView(zoomAbout(viewRef.current, factor, 0.5, 0.5, VIEW_W, h, aspectRef.current));
  };
  const resetZoom = () => {
    userMovedRef.current = false;
    autoZoomedRef.current = false;
    animateTo(homeView(VIEW_W, h));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const v = viewRef.current;
    const b = viewBoxOf(v, VIEW_W, h, aspectRef.current);
    const pan = (dx: number, dy: number) => {
      userMoved();
      applyView(
        clampView(
          { ...v, cx: v.cx + dx * b.w * KEY_PAN, cy: v.cy + dy * b.h * KEY_PAN },
          VIEW_W,
          h,
          aspectRef.current,
        ),
      );
    };
    if (e.key === "+" || e.key === "=") zoomBy(BUTTON_FACTOR);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / BUTTON_FACTOR);
    else if (e.key === "0") resetZoom();
    else if (e.key === "ArrowLeft") pan(-1, 0);
    else if (e.key === "ArrowRight") pan(1, 0);
    else if (e.key === "ArrowUp") pan(0, -1);
    else if (e.key === "ArrowDown") pan(0, 1);
    else return;
    e.preventDefault();
  };

  const toggleHeatmap = () => {
    const next = !showHeatmap;
    setShowHeatmap(next);
    setHover(null);
    if (next) {
      if (south && activePixel) {
        preAutoViewRef.current = viewRef.current;
        autoZoomedRef.current = true;
        userMovedRef.current = false;
        const spanUnits = (AUTO_ZOOM_SPAN_KM * 1000) / metresPerUnit;
        animateTo({
          zoom: zoomForSpan(spanUnits, VIEW_W, h, aspectRef.current),
          cx: activePixel.x,
          cy: activePixel.y,
        });
      }
    } else {
      // Zoom back out only if the user has not taken over the view since the auto-zoom.
      if (autoZoomedRef.current && !userMovedRef.current)
        animateTo(preAutoViewRef.current ?? homeView(VIEW_W, h));
      autoZoomedRef.current = false;
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

  // Polar stereographic stretches distances away from the pole, so the bar shortens by the local scale factor.
  const centre = south ? southFromPixel(view.cx, view.cy, VIEW_W) : null;
  const k = centre ? 2 / (1 + Math.sin((Math.abs(centre.lat) * Math.PI) / 180)) : 1;
  const bar = scaleBar((metresPerUnit * pxu) / (Number.isFinite(k) && k > 0 ? k : 1), BAR_MAX);
  const heatOutOfMap = south && showHeatmap && !activePixel;
  const zoomLabel = `${clampZoom(view.zoom).toFixed(1)}x`;
  const hoverText = hover
    ? `${hover.lat.toFixed(2)}°, ${hover.lon.toFixed(2)}°: ${Math.round(hover.bothH)} h of Sun and Earth together`
    : "Hover or tap a cell to read it; click (or tap again) to add it as a new scenario.";

  return (
    <Stack gap={2}>
      <HStack gap={1.5} wrap="wrap" align="center">
        <Button
          label="Nearby heatmap (20 km)"
          size="lg"
          variant={showHeatmap ? "secondary" : "ghost"}
          aria-pressed={showHeatmap}
          isDisabled={!south}
          onClick={toggleHeatmap}
        />
        <Button
          label="Permanent shadow (PSR)"
          size="lg"
          variant={showPsr ? "secondary" : "ghost"}
          aria-pressed={showPsr}
          isDisabled={!south}
          onClick={() => setShowPsr((v) => !v)}
        />
        <Button
          label="Zoom out"
          size="lg"
          variant="secondary"
          icon={<Icon icon={ZoomOut} />}
          isDisabled={view.zoom <= MIN_ZOOM}
          onClick={() => zoomBy(1 / BUTTON_FACTOR)}
        />
        <Button
          label="Zoom in"
          size="lg"
          variant="secondary"
          icon={<Icon icon={ZoomIn} />}
          isDisabled={view.zoom >= MAX_ZOOM}
          onClick={() => zoomBy(BUTTON_FACTOR)}
        />
        <Button
          label="Reset zoom"
          size="lg"
          variant="ghost"
          icon={<Icon icon={RotateCcw} />}
          onClick={resetZoom}
        />
        <Stack data-testid="zoom-badge">
          <Token label={zoomLabel} size="lg" description="Current map zoom" />
        </Stack>
      </HStack>
      {south ? null : (
        <Text type="supporting" size="xsm">
          The heatmap and permanent shadow layers are available in the South pole view.
        </Text>
      )}
      {heatOutOfMap ? (
        <Text type="supporting" size="xsm">
          The selected site is outside the south polar basemap, so there is no heatmap around it.
        </Text>
      ) : null}
      <svg
        ref={ref}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width="100%"
        role="application"
        aria-roledescription="map"
        tabIndex={0}
        aria-label={south ? "South polar map" : "Map of the whole Moon"}
        aria-describedby="map-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        style={{
          display: "block",
          cursor: "crosshair",
          // At 1x vertical swipes scroll the page; zoomed in, one finger pans the map.
          touchAction: view.zoom > MIN_ZOOM + 0.001 ? "none" : "pan-y",
          background: CARD,
          height: height ?? "auto",
          aspectRatio: height ? undefined : `${VIEW_W} / ${h}`,
        }}
        data-testid={`map-${mode}`}
        data-mode={mode}
        data-zoom={view.zoom.toFixed(2)}
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
          <g
            data-testid="psr-layer"
            style={{
              pointerEvents: "none",
              fill: DEEPEST,
              fillOpacity: 0.65,
              stroke: INK,
              strokeWidth: pxu,
              strokeDasharray: `${3 * pxu} ${3 * pxu}`,
            }}
          >
            {psrPaths}
          </g>
        ) : null}
        {south && showHeatmap ? (
          <g
            data-testid="heatmap-layer"
            onPointerOver={(e) => {
              if (e.pointerType === "touch") return;
              const cell = cellOf(e.target);
              if (cell) setHover(cell);
            }}
            onPointerOut={(e) => {
              if (e.pointerType === "touch") return;
              const cell = cellOf(e.target);
              if (cell) setHover((cur) => (cur === cell ? null : cur));
            }}
            onClick={(e) => {
              const cell = cellOf(e.target);
              if (!cell) return;
              e.stopPropagation();
              // Touch has no hover: the first tap reads the cell, a second tap on it adds the scenario.
              if (lastPointerTypeRef.current === "touch" && hover !== cell) {
                setHover(cell);
                return;
              }
              pickHeatmapPoint(cell.lat, cell.lon);
            }}
          >
            {heatRects}
            {hover ? (
              <rect
                data-testid="heatmap-hover"
                x={hover.x - cellSize / 2}
                y={hover.y - cellSize / 2}
                width={cellSize}
                height={cellSize}
                style={{ fill: "none", stroke: INK, strokeWidth: 2 * pxu, pointerEvents: "none" }}
              />
            ) : null}
          </g>
        ) : null}
        {sitePins.map(({ site, p }) => (
          <circle
            key={site.id}
            cx={p.x}
            cy={p.y}
            r={DOT_R * pxu}
            style={{ fill: INK, stroke: CARD, strokeWidth: 1.5 * pxu }}
          >
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
              transform={`translate(${p.x} ${p.y}) scale(${pxu})`}
              data-testid={`pin-${sc.key}`}
              data-pin-key={sc.key}
              style={{ cursor: "grab", touchAction: "none" }}
            >
              <g style={{ fill: CARD, stroke: INK, strokeWidth: selected ? 3 : 2 }}>
                <Glyph index={i} r={PIN_R} />
              </g>
              <text
                textAnchor="middle"
                dominantBaseline="central"
                y={i % 4 === 2 ? 3 : 0}
                style={{ fill: INK, fontSize: 14, fontWeight: 500, pointerEvents: "none" }}
              >
                {letter}
              </text>
              <title>{`Scenario ${letter}`}</title>
            </g>
          );
        })}
        <g
          data-testid="scale-bar"
          transform={`translate(${vb.x + MARGIN * pxu} ${vb.y + vb.h - MARGIN * pxu}) scale(${pxu})`}
          style={{ pointerEvents: "none" }}
        >
          <rect
            x={-6}
            y={-30}
            width={BAR_MAX + 12}
            height={38}
            style={{ fill: CARD, opacity: 0.85 }}
          />
          <line x1={0} x2={bar.px} y1={0} y2={0} style={{ stroke: INK, strokeWidth: 2 }} />
          <line x1={0} x2={0} y1={-4} y2={4} style={{ stroke: INK, strokeWidth: 2 }} />
          <line x1={bar.px} x2={bar.px} y1={-4} y2={4} style={{ stroke: INK, strokeWidth: 2 }} />
          <text x={0} y={-9} style={{ fill: INK, fontSize: 12 }}>
            {south ? bar.label : `${bar.label} at the equator`}
          </text>
        </g>
      </svg>
      {south && showHeatmap ? (
        <Stack gap={1} data-testid="heatmap-legend">
          <HStack gap={2} justify="between" wrap="wrap">
            <Text type="supporting" size="xsm">
              {legend.low}
            </Text>
            <Text type="supporting" size="xsm">
              {legend.high}
            </Text>
          </HStack>
          <HStack gap={0.5}>
            {legend.steps.map((st, i) => (
              <Stack
                key={st.label}
                gap={0.5}
                style={{ flex: 1 }}
                data-testid={`heatmap-legend-step-${i}`}
              >
                <Stack
                  style={{ height: "0.75rem", background: st.fill, opacity: HEATMAP_FILL_OPACITY }}
                />
                <Text type="supporting" size="xsm">
                  {st.label}
                </Text>
              </Stack>
            ))}
          </HStack>
          <Text type="supporting" size="xsm" data-testid="heatmap-readout" aria-live="polite">
            {hoverText}
          </Text>
        </Stack>
      ) : null}
      <Text type="supporting" size="xsm" id="map-help">
        {south
          ? `North is up and 0° E at the top. Click for a custom point, drag the pin to move it, drag empty map to pan, click a dot for a catalogue site. Click the map, then scroll to zoom (or Ctrl+scroll), or pinch. ${KEYBOARD_HELP}${
              showPsr
                ? " Zero average sunlight over the 18.6-yr illumination model, NASA PGDA 120 m (Mazarico et al. 2011). Regions under 1 km² omitted."
                : ""
            }${showHeatmap ? " Heatmap cells show hours with the Sun and Earth both above the horizon over the mission window, on the 2 km LOLA grid. Click (or tap again) a cell to add it as a new scenario." : ""}`
          : `Click for a custom point, drag the pin to move it, drag empty map to pan, click a dot for a catalogue site. Click the map, then scroll to zoom (or Ctrl+scroll), or pinch. ${KEYBOARD_HELP}`}
      </Text>
    </Stack>
  );
}
