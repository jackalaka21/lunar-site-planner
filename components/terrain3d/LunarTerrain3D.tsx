"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
import { Stack } from "@astryxdesign/core/Stack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { useTheme } from "@astryxdesign/core/theme";
import {
  buildCoarsePolarPatch,
  loadPolarDem,
  loadSitePatch,
  type LocalTerrainPatch,
} from "../../lib/data/terrain";
import { earthPhase } from "../../lib/engine/disc";
import { horizonAt } from "../../lib/engine/horizon";
import type { TimeSeries } from "../../lib/engine/sample";
import type { HorizonProfile, Topo } from "../../lib/engine/types";
import { withAlpha } from "../panorama/layout";
import { panoramaPalette } from "../panorama/palette";
import { TerrainGlScene, LANDER_TOP, type SurfaceMode } from "./glScene";
import { drawHud, terrainNotes, type PsrStatus } from "./hud";
import { parseColor, terrainPalette } from "./palette";
import { loadPsr } from "./psr";
import {
  ellipseRingKm,
  findBlocker,
  sampleHeightM,
  localPsrRings,
  psrVertexMask,
  PSR_MIN_ABS_LAT_DEG,
  type Blocker,
} from "./terrainModel";
import { PHONE_BREAKPOINT_REM, viewportHeightPx } from "./viewport";

export interface LunarTerrain3DProps {
  horizon: HorizonProfile;
  series: TimeSeries;
  cursorIndex: number;
  lat: number;
  lon: number;
  /** Catalogue site id; its real LOLA patch is loaded. Omit for a custom point. */
  siteId?: string;
  obsHeightM: number;
  /** Landing ellipse radius, km (the robustness settings value). */
  ellipseKm?: number;
  pole?: boolean;
  /** Fixed canvas height in px. Omit to choose by layout (520 single, 400 compare, 340 phone). */
  height?: number;
  /** Override for the compare layout; otherwise read from the enclosing grid's data-columns. */
  layout?: "single" | "compare";
  onScrubTime?: (deltaMs: number) => void;
}

const PATCH_RADIUS_KM = 10;
const DEFAULT_RELIEF = 3;
const ORBIT_AZ = 215;
const ORBIT_PITCH = 26;
const ORBIT_DIST = 18;
const FOV_DEG = 45;
const SKY_RADIUS_KM = 9.6;
/** Vertical exaggeration for sky elevation angles so grazing 1.5 deg polar tracks are clearly separated above ridges. */
const SKY_EL_SCALE_KM_PER_DEG = 0.36;
const DEFAULT_SUN_R = 0.2666;
const DEFAULT_EARTH_R = 0.95;

const COMPASS_POINTS: Array<{ az: number; label: string }> = [
  { az: 0, label: "N" },
  { az: 90, label: "E" },
  { az: 180, label: "S" },
  { az: 270, label: "W" },
];

/** Phones: control rows stay one line each and scroll sideways instead of wrapping to three rows. */
const SCROLL_ROW_CSS =
  `@media (max-width: ${PHONE_BREAKPOINT_REM}rem){` +
  `[data-terrain-scroll="true"]{flex-wrap:nowrap !important;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}` +
  `[data-terrain-scroll="true"]>*{flex:0 0 auto}}`;

interface ViewState {
  mode: "orbit" | "pov";
  az: number;
  pitch: number;
  dist: number;
  lookAz: number;
  lookPitch: number;
}

const DEFAULT_VIEW: ViewState = { mode: "orbit", az: ORBIT_AZ, pitch: ORBIT_PITCH, dist: ORBIT_DIST, lookAz: 0, lookPitch: 4 };
const VIEWPORT_DEFAULT = 520;
const TOP_DOWN_DIST = 25.5;
const MAX_DIST = 45;
const MIN_DIST = 6;

/** Longest wait for an idle slot before heavy GL work runs anyway. */
const DEFER_TIMEOUT_MS = 300;

/**
 * Run `fn` in a later task, after the next paint and (usually) after queued worker messages: two rAFs, then an idle
 * callback (timeout 300 ms) or a setTimeout fallback. Returns a cancel function.
 */
function deferHeavyWork(fn: () => void): () => void {
  let raf1 = 0;
  let raf2 = 0;
  let idle = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  const afterPaint = () => {
    if (typeof window.requestIdleCallback === "function") {
      idle = window.requestIdleCallback(run, { timeout: DEFER_TIMEOUT_MS });
    } else {
      timer = setTimeout(run, 0);
    }
  };
  if (typeof window.requestAnimationFrame === "function") {
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(afterPaint);
    });
    // Hidden tabs never fire rAF: fall back to a timer so the scene still builds.
    timer = setTimeout(run, DEFER_TIMEOUT_MS * 3);
  } else {
    afterPaint();
  }
  return () => {
    done = true;
    if (raf1) window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}

function canUseWebGl(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function parseRgb(color: string): [number, number, number] {
  const c = parseColor(color);
  return [c.r, c.g, c.b];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

function rgbStr(c: [number, number, number], alpha = 1): string {
  return alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function tracksOf(series: TimeSeries) {
  return {
    sunAz: series.sunAz,
    sunEl: series.sunEl,
    earthAz: series.earthAz,
    earthEl: series.earthEl,
    n: series.n,
  };
}

function topoAt(az: number, el: number, r: number): Topo {
  return { az, el, r, distKm: 0 };
}

/** Convert (azDeg, elDeg) on the sky dome into local 3D coordinates (X=East, Y=Up, Z=South). */
function skyDomeVec(azDeg: number, elDeg: number, radiusKm = SKY_RADIUS_KM): THREE.Vector3 {
  const azRad = (azDeg * Math.PI) / 180;
  const clampedEl = Math.max(-8, Math.min(45, elDeg));
  const yKm = clampedEl * SKY_EL_SCALE_KM_PER_DEG;
  const horizKm = Math.max(2.5, radiusKm - Math.max(0, clampedEl) * 0.08);
  const xKm = horizKm * Math.sin(azRad);
  const zKm = -horizKm * Math.cos(azRad);
  return new THREE.Vector3(xKm, yKm, zKm);
}

/** Caption naming the real LOLA product and resolution behind a patch. */
export function terrainCaption(patch: LocalTerrainPatch, relief = DEFAULT_RELIEF): string {
  const size = `${2 * patch.radiusKm} × ${2 * patch.radiusKm} km`;
  const vert = `vertical ×${relief}`;
  switch (patch.source) {
    case "LOLA polar 40 m":
      return `LOLA polar DEM, ${size} at ${patch.spacingM} m (from 40 m), ${vert}`;
    case "LOLA polar 120 m":
      return `LOLA polar DEM, ${size} at ${patch.spacingM} m (from 120 m), ${vert}`;
    case "LOLA global 64 ppd":
      return `LOLA global DEM (~470 m), ${size}, ${vert}`;
    default:
      return `LOLA 2 km grid (coarse), ${size}, ${vert}`;
  }
}

export function LunarTerrain3D({
  horizon,
  series,
  cursorIndex,
  lat,
  lon,
  siteId,
  obsHeightM,
  ellipseKm = 0.5,
  pole = false,
  height: heightProp,
  layout,
}: LunarTerrain3DProps) {
  const wrapRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // ssr:false, so window exists here: start at the right height for this layout instead of flashing 520 on phones.
  const [{ width, height }, setSize] = useState(() => ({
    width: 0,
    height:
      heightProp ??
      (typeof window === "undefined"
        ? VIEWPORT_DEFAULT
        : viewportHeightPx({
            columns: layout === "compare" ? 2 : 1,
            viewportWidthPx: window.innerWidth,
            remPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
          })),
  }));
  const [useGl, setUseGl] = useState<boolean>(() => typeof document !== "undefined" && canUseWebGl());
  const [relief, setRelief] = useState<number>(DEFAULT_RELIEF);
  const [surface, setSurface] = useState<SurfaceMode>("shaded");
  const [psrOn, setPsrOn] = useState(false);
  const [psrRingsState, setPsrRingsState] = useState<{ key: string; rings: ReturnType<typeof localPsrRings> } | null>(null);
  const [glEpoch, setGlEpoch] = useState(0);
  const glLostRef = useRef(0);
  const sceneRef = useRef<TerrainGlScene | null>(null);
  const focusedRef = useRef(false);
  const [patchState, setPatchState] = useState<{ key: string; patch: LocalTerrainPatch | null } | null>(null);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const camMode = view.mode;
  const orbitAz = view.az;
  const orbitPitch = view.pitch;
  const orbitDist = view.dist;
  const dragRef = useRef<{ x: number; y: number; az: number; pitch: number } | null>(null);
  const viewRef = useRef<ViewState>(view);
  useEffect(() => {
    viewRef.current = view;
  });
  const { mode } = useTheme();

  const patchKey = siteId ? `site:${siteId}` : `pt:${lat}:${lon}`;
  useEffect(() => {
    let active = true;
    const done = (patch: LocalTerrainPatch | null) => {
      if (active) setPatchState({ key: patchKey, patch });
    };
    const job: Promise<LocalTerrainPatch | null> = siteId
      ? loadSitePatch(siteId)
      : loadPolarDem().then((dem) => buildCoarsePolarPatch(dem, lat, lon, PATCH_RADIUS_KM));
    job.then(done).catch(() => done(null));
    return () => {
      active = false;
    };
  }, [patchKey, siteId, lat, lon]);

  const patch = patchState && patchState.key === patchKey ? patchState.patch : null;
  const unavailable = patchState !== null && patchState.key === patchKey && patchState.patch === null;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      let h = heightProp;
      if (h === undefined) {
        const cols =
          layout === "compare"
            ? 2
            : layout === "single"
              ? 1
              : Number(el.closest("[data-columns]")?.getAttribute("data-columns") ?? 1);
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        h = viewportHeightPx({ columns: cols, viewportWidthPx: window.innerWidth, remPx: rem });
      }
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [heightProp, layout, unavailable]);

  const idx = Math.min(Math.max(cursorIndex, 0), Math.max(series.n - 1, 0));
  const sunAz = series.sunAz[idx] ?? 0;
  const sunEl = series.sunEl[idx] ?? 0;
  const earthAz = series.earthAz[idx] ?? 0;
  const earthEl = series.earthEl[idx] ?? 0;
  const sunRidgeEl = horizonAt(horizon, sunAz);
  const earthRidgeEl = horizonAt(horizon, earthAz);
  const isSunLit = sunEl >= sunRidgeEl;
  const isEarthUp = earthEl >= earthRidgeEl;

  // Precompute 3D vertices and vertex normals in local km (Y is elevation relative to hDemM, scaled by VERT_EXAG)
  const meshData = useMemo(() => {
    if (!patch) return null;
    const gs = patch.gridSize;
    const rKm = patch.radiusKm;
    const verts: THREE.Vector3[] = new Array(gs * gs);
    for (let iy = 0; iy < gs; iy++) {
      const northKm = ((iy / (gs - 1)) * 2 - 1) * rKm;
      const zKm = -northKm; // +Z is South, -Z is North
      for (let ix = 0; ix < gs; ix++) {
        const eastKm = ((ix / (gs - 1)) * 2 - 1) * rKm;
        const dhKm = ((patch.heightsM[iy * gs + ix] - patch.centerHM) / 1000) * relief;
        verts[iy * gs + ix] = new THREE.Vector3(eastKm, dhKm, zKm);
      }
    }
    return { gs, verts };
  }, [patch, relief]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (useGl || !canvas || width <= 0 || !patch || !meshData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pal = panoramaPalette(mode);
    const farRgb = parseRgb(pal.far);
    const nearRgb = parseRgb(pal.near);
    const deepRgb = parseRgb(pal.deepest);
    const sunRgb = parseRgb(pal.sun);
    const rimRgb = parseRgb(pal.rim);

    // Clear sky background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = pal.sky;
    ctx.fillRect(0, 0, width, height);

    // Setup THREE.PerspectiveCamera
    const camera = new THREE.PerspectiveCamera(FOV_DEG, width / Math.max(height, 1), 0.1, 120);
    const azRad = (orbitAz * Math.PI) / 180;
    const pitchRad = (orbitPitch * Math.PI) / 180;

    if (camMode === "orbit") {
      const horiz = orbitDist * Math.cos(pitchRad);
      const camX = horiz * Math.sin(azRad);
      const camZ = -horiz * Math.cos(azRad);
      const camY = orbitDist * Math.sin(pitchRad) + 1.1;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0.35, 0);
    } else {
      // Lander POV: camera positioned slightly behind lander looking toward orbitAz
      const lookAzRad = (view.lookAz * Math.PI) / 180;
      const lookPitchRad = (view.lookPitch * Math.PI) / 180;
      const mastY = Math.max(0.28, (obsHeightM / 1000) * relief + 0.25);
      camera.position.set(-Math.sin(lookAzRad) * 1.4, mastY + 0.35, Math.cos(lookAzRad) * 1.4);
      camera.lookAt(
        Math.sin(lookAzRad) * 10,
        mastY + Math.sin(lookPitchRad) * 4,
        -Math.cos(lookAzRad) * 10,
      );
    }
    camera.updateMatrixWorld();

    const project = (v: THREE.Vector3): { x: number; y: number; z: number; visible: boolean } => {
      const p = v.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * width,
        y: (-p.y * 0.5 + 0.5) * height,
        z: p.z,
        visible: p.z >= -1 && p.z <= 1.05,
      };
    };

    // Directional Sun vector in 3D world space for Lambertian slope shading
    const sunAzRad = (sunAz * Math.PI) / 180;
    const sunElRad = (Math.max(2, sunEl + 8) * Math.PI) / 180;
    const sunLightDir = new THREE.Vector3(
      Math.cos(sunElRad) * Math.sin(sunAzRad),
      Math.sin(sunElRad),
      -Math.cos(sunElRad) * Math.cos(sunAzRad),
    ).normalize();

    // Build and depth-sort 3D terrain quads
    const { gs, verts } = meshData;
    interface Quad {
      p0: { x: number; y: number };
      p1: { x: number; y: number };
      p2: { x: number; y: number };
      p3: { x: number; y: number };
      depth: number;
      fill: string;
      stroke: string;
    }
    const quads: Quad[] = [];
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const norm = new THREE.Vector3();
    const center = new THREE.Vector3();

    const spanH = Math.max(100, patch.maxHM - patch.minHM);

    for (let iy = 0; iy < gs - 1; iy++) {
      for (let ix = 0; ix < gs - 1; ix++) {
        const v00 = verts[iy * gs + ix];
        const v10 = verts[iy * gs + (ix + 1)];
        const v11 = verts[(iy + 1) * gs + (ix + 1)];
        const v01 = verts[(iy + 1) * gs + ix];

        const p0 = project(v00);
        const p1 = project(v10);
        const p2 = project(v11);
        const p3 = project(v01);
        if (!p0.visible && !p1.visible && !p2.visible && !p3.visible) continue;

        center.copy(v00).add(v10).add(v11).add(v01).multiplyScalar(0.25);
        const depth = center.distanceToSquared(camera.position);

        // Compute surface normal
        e1.subVectors(v10, v00);
        e2.subVectors(v01, v00);
        norm.crossVectors(e2, e1).normalize();
        if (norm.y < 0) norm.negate();

        const ndotl = Math.max(0, norm.dot(sunLightDir));
        const avgH =
          (patch.heightsM[iy * gs + ix] +
            patch.heightsM[iy * gs + (ix + 1)] +
            patch.heightsM[(iy + 1) * gs + (ix + 1)] +
            patch.heightsM[(iy + 1) * gs + ix]) *
          0.25;
        const hNorm = Math.max(0, Math.min(1, (avgH - patch.minHM) / spanH));

        // Base lunar regolith tone from elevation + slope lighting
        const baseTone = mixRgb(deepRgb, mixRgb(farRgb, nearRgb, hNorm), 0.35 + 0.65 * ndotl);
        const litTone = isSunLit
          ? mixRgb(baseTone, sunRgb, Math.pow(ndotl, 2) * 0.18)
          : mixRgb(baseTone, deepRgb, 0.35);

        quads.push({
          p0,
          p1,
          p2,
          p3,
          depth,
          fill: rgbStr(litTone),
          stroke: rgbStr(mixRgb(litTone, rimRgb, 0.28), 0.45),
        });
      }
    }

    quads.sort((a, b) => b.depth - a.depth);

    ctx.lineWidth = 0.65;
    for (const q of quads) {
      ctx.beginPath();
      ctx.moveTo(q.p0.x, q.p0.y);
      ctx.lineTo(q.p1.x, q.p1.y);
      ctx.lineTo(q.p2.x, q.p2.y);
      ctx.lineTo(q.p3.x, q.p3.y);
      ctx.closePath();
      ctx.fillStyle = q.fill;
      ctx.fill();
      ctx.strokeStyle = q.stroke;
      ctx.stroke();
    }

    // Draw 3D zero-elevation compass ring & true LOLA horizon skyline curtain around the perimeter
    ctx.save();
    ctx.strokeStyle = withAlpha(pal.rim, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let startedRing = false;
    for (let az = 0; az <= 360; az += 3) {
      const pt = project(skyDomeVec(az, 0, SKY_RADIUS_KM));
      if (!pt.visible) {
        startedRing = false;
        continue;
      }
      if (!startedRing) {
        ctx.moveTo(pt.x, pt.y);
        startedRing = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();

    // True LOLA horizon skyline profile ring in 3D space
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let startedSkyline = false;
    for (let az = 0; az <= 360; az += 2) {
      const hEl = horizonAt(horizon, az);
      const pt = project(skyDomeVec(az, hEl, SKY_RADIUS_KM));
      if (!pt.visible) {
        startedSkyline = false;
        continue;
      }
      if (!startedSkyline) {
        ctx.moveTo(pt.x, pt.y);
        startedSkyline = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Draw landing uncertainty ellipse ring around (0, 0, 0)
    const ringRadiusKm = ellipseRingKm(ellipseKm, patch.radiusKm);
    ctx.save();
    ctx.strokeStyle = withAlpha(pal.sun, 0.8);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    let ringStarted = false;
    for (let deg = 0; deg <= 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const pt = project(
        new THREE.Vector3(Math.sin(rad) * ringRadiusKm, 0.05, -Math.cos(rad) * ringRadiusKm),
      );
      if (!pt.visible) continue;
      if (!ringStarted) {
        ctx.moveTo(pt.x, pt.y);
        ringStarted = true;
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    // Draw 14-day Sun and Earth sky tracks in 3D
    const drawSkyTrack = (azArr: Float32Array, elArr: Float32Array, color: string) => {
      ctx.save();
      ctx.strokeStyle = withAlpha(color, 0.65);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < series.n; i++) {
        const pt = project(skyDomeVec(azArr[i], elArr[i], SKY_RADIUS_KM));
        if (!pt.visible) {
          open = false;
          continue;
        }
        if (!open) {
          ctx.moveTo(pt.x, pt.y);
          open = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
      ctx.restore();
    };
    drawSkyTrack(series.earthAz, series.earthEl, pal.earth);
    drawSkyTrack(series.sunAz, series.sunEl, pal.sun);

    // Lander mast pin at (0, 0, 0)
    const mastHeightKm = Math.max(0.28, (obsHeightM / 1000) * relief + 0.22);
    const landerBase = project(new THREE.Vector3(0, 0, 0));
    const landerTop = project(new THREE.Vector3(0, mastHeightKm, 0));

    // Sightline beams from lander top to Earth and Sun
    const earthSkyVec = skyDomeVec(earthAz, earthEl, SKY_RADIUS_KM);
    const earthPt = project(earthSkyVec);
    const earthRidgePt = project(skyDomeVec(earthAz, earthRidgeEl, SKY_RADIUS_KM));

    if (landerTop.visible && earthPt.visible) {
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.earth, isEarthUp ? 0.85 : 0.45);
      ctx.lineWidth = isEarthUp ? 1.6 : 1.2;
      if (!isEarthUp) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(landerTop.x, landerTop.y);
      ctx.lineTo(earthPt.x, earthPt.y);
      ctx.stroke();
      ctx.restore();
    }

    const sunSkyVec = skyDomeVec(sunAz, sunEl, SKY_RADIUS_KM);
    const sunPt = project(sunSkyVec);
    const sunRidgePt = project(skyDomeVec(sunAz, sunRidgeEl, SKY_RADIUS_KM));

    if (landerTop.visible && sunPt.visible) {
      ctx.save();
      ctx.strokeStyle = withAlpha(pal.sun, isSunLit ? 0.9 : 0.45);
      ctx.lineWidth = isSunLit ? 1.8 : 1.2;
      if (!isSunLit) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(landerTop.x, landerTop.y);
      ctx.lineTo(sunPt.x, sunPt.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw Lander Mast Pin
    if (landerBase.visible && landerTop.visible) {
      ctx.save();
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(landerBase.x, landerBase.y);
      ctx.lineTo(landerTop.x, landerTop.y);
      ctx.stroke();

      ctx.fillStyle = isSunLit ? pal.sun : pal.near;
      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(landerTop.x, landerTop.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw Earth disc in 3D sky with phase
    if (earthPt.visible) {
      const phase = earthPhase(
        topoAt(sunAz, sunEl, DEFAULT_SUN_R),
        topoAt(earthAz, earthEl, DEFAULT_EARTH_R),
      );
      const f = phase.illuminatedFraction;
      const rPx = 7.5;
      ctx.save();
      ctx.globalAlpha = isEarthUp ? 1 : 0.45;
      ctx.fillStyle = pal.deepest;
      ctx.beginPath();
      ctx.arc(earthPt.x, earthPt.y, rPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(earthPt.x, earthPt.y);
      ctx.scale(rPx, rPx);
      ctx.rotate((phase.brightLimbDeg * Math.PI) / 180);
      ctx.beginPath();
      ctx.arc(0, 0, 1, Math.PI, Math.PI * 2);
      ctx.ellipse(0, 0, 1, Math.abs(1 - 2 * f), 0, 0, Math.PI, f <= 0.5);
      ctx.closePath();
      ctx.fillStyle = pal.earth;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = pal.rim;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(earthPt.x, earthPt.y, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (!isEarthUp && earthRidgePt.visible) {
        ctx.save();
        ctx.strokeStyle = pal.earth;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(earthRidgePt.x, earthRidgePt.y, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw Sun disc in 3D sky
    if (sunPt.visible) {
      const rPx = 9;
      ctx.save();
      ctx.globalAlpha = isSunLit ? 1 : 0.42;
      const g = ctx.createRadialGradient(sunPt.x, sunPt.y, 0, sunPt.x, sunPt.y, rPx * 1.6);
      g.addColorStop(0, pal.sun);
      g.addColorStop(0.55, pal.sun);
      g.addColorStop(1, withAlpha(pal.sun, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sunPt.x, sunPt.y, rPx * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!isSunLit && sunRidgePt.visible) {
        ctx.save();
        ctx.strokeStyle = pal.sun;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sunRidgePt.x, sunRidgePt.y, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw 3D Compass Labels (N, E, S, W) and Sun/Earth callouts
    ctx.save();
    ctx.font = "600 11px var(--font-family-code), monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const c of COMPASS_POINTS) {
      const pt = project(skyDomeVec(c.az, -1.2, SKY_RADIUS_KM * 1.04));
      if (!pt.visible) continue;
      ctx.fillStyle = withAlpha(pal.sky, 0.78);
      ctx.fillRect(pt.x - 9, pt.y - 7, 18, 14);
      ctx.fillStyle = pal.rim;
      ctx.fillText(c.label, pt.x, pt.y);
    }

    // Sun & Earth labels
    ctx.font = "500 11px var(--font-family-code), monospace";
    if (sunPt.visible) {
      const label = `Sun ${sunEl >= 0 ? "+" : ""}${sunEl.toFixed(1)}°`;
      ctx.fillStyle = pal.sun;
      ctx.fillText(label, sunPt.x, Math.max(14, sunPt.y - 14));
    }
    if (earthPt.visible) {
      const label = `Earth ${earthEl >= 0 ? "+" : ""}${earthEl.toFixed(1)}°`;
      ctx.fillStyle = pal.earth;
      ctx.fillText(label, earthPt.x, Math.max(14, earthPt.y - 14));
    }

    // Bottom-left plain-English status line; legends and caption are page text under the controls.
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = pal.rim;

    const statusLine =
      `Sun ${isSunLit ? "clear of" : "behind"} ${sunRidgeEl.toFixed(1)}° ridge · ` +
      `Earth ${isEarthUp ? "clear of" : "behind"} ${earthRidgeEl.toFixed(1)}° ridge`;
    ctx.fillText(statusLine, 10, height - 8);
    ctx.restore();
  }, [
    width,
    height,
    mode,
    orbitAz,
    orbitPitch,
    orbitDist,
    camMode,
    view.lookAz,
    view.lookPitch,
    useGl,
    relief,
    obsHeightM,
    sunAz,
    sunEl,
    earthAz,
    earthEl,
    sunRidgeEl,
    earthRidgeEl,
    isSunLit,
    isEarthUp,
    meshData,
    patch,
    horizon,
    ellipseKm,
    series,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // ---- Derived overlay data -------------------------------------------------------------------------------
  const psrEligible = !!patch && lat <= -PSR_MIN_ABS_LAT_DEG;
  const [psrFailed, setPsrFailed] = useState(false);
  useEffect(() => {
    if (!psrOn || !patch || !psrEligible) return;
    let active = true;
    loadPsr()
      .then((data) => {
        if (!active) return;
        const polys = data.features.map((f) => ({ coordinates: f.geometry.coordinates }));
        setPsrRingsState({ key: `${lat}:${lon}:${patch.radiusKm}`, rings: localPsrRings(polys, lat, lon, patch.radiusKm) });
      })
      .catch(() => {
        if (active) setPsrFailed(true);
      });
    return () => {
      active = false;
    };
  }, [psrOn, patch, psrEligible, lat, lon]);
  const psrRings = psrRingsState && patch && psrRingsState.key === `${lat}:${lon}:${patch.radiusKm}` ? psrRingsState.rings : null;
  const psrMask = useMemo(
    () => (psrOn && patch && psrEligible && psrRings ? psrVertexMask(patch, psrRings) : null),
    [psrOn, patch, psrEligible, psrRings],
  );
  const psrStatus: PsrStatus =
    !psrOn || !psrEligible
      ? "off"
      : psrFailed
        ? "error"
        : !psrMask
          ? "loading"
          : psrMask.some((v) => v === 1)
            ? "ready"
            : "none";

  const sunBlocker = useMemo<Blocker | null>(
    () => (patch && !isSunLit && sunEl >= 0 ? findBlocker(patch, sunAz, sunEl, obsHeightM) : null),
    [patch, isSunLit, sunAz, sunEl, obsHeightM],
  );
  const earthBlocker = useMemo<Blocker | null>(
    () => (patch && !isEarthUp && earthEl >= 0 ? findBlocker(patch, earthAz, earthEl, obsHeightM) : null),
    [patch, isEarthUp, earthAz, earthEl, obsHeightM],
  );

  // ---- WebGL scene, camera damping and on-demand rendering ---------------------------------------------------
  const live = {
    width,
    height,
    view,
    relief,
    surface,
    psrMask,
    psrStatus,
    sunAz,
    sunEl,
    earthAz,
    earthEl,
    sunRidgeEl,
    earthRidgeEl,
    isSunLit,
    isEarthUp,
    sunBlocker,
    earthBlocker,
  };
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const kickRef = useRef<() => void>(() => {});
  const horizonRef = useRef(horizon);
  const seriesRef = useRef(series);
  useEffect(() => {
    horizonRef.current = horizon;
    seriesRef.current = series;
  });

  useEffect(() => {
    if (!useGl || !patch) return;
    // The scene build (mesh, normals, shadow map, contours) is heavy and synchronous. Defer it past the first paint and
    // any pending engine result so it never delays the worker round trip; unmount or a dep change cancels it cleanly.
    let cancelled = false;
    let teardown: (() => void) | undefined;
    const cancelDefer = deferHeavyWork(() => {
      if (!cancelled) teardown = build();
    });
    return () => {
      cancelled = true;
      cancelDefer();
      teardown?.();
    };

    function build(): (() => void) | undefined {
    const wrap = wrapRef.current;
    const hudCanvas = canvasRef.current;
    if (!wrap || !hudCanvas || !patch) return undefined;
    // A fresh WebGL canvas per scene: disposing a scene force-loses its context, and a lost context can never be
    // reused, so a scene rebuilt on the same element (new site, new series, StrictMode) would fail and drop to 2D.
    const glCanvas = document.createElement("canvas");
    glCanvas.setAttribute("aria-hidden", "true");
    Object.assign(glCanvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    wrap.insertBefore(glCanvas, wrap.firstChild);
    let sc: TerrainGlScene;
    try {
      sc = new TerrainGlScene(glCanvas, patch, terrainPalette(mode), {
        obsHeightM,
        ellipseKm,
        horizon: horizonRef.current,
        skyTracks: tracksOf(seriesRef.current),
      });
    } catch {
      glCanvas.remove();
      void Promise.resolve().then(() => setUseGl(false));
      return undefined;
    }
    sceneRef.current = sc;
    const onLost = (ev: Event) => {
      ev.preventDefault();
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      glLostRef.current += 1;
      if (glLostRef.current >= 2) setUseGl(false);
    };
    const onRestored = () => setGlEpoch((e) => e + 1);
    glCanvas.addEventListener("webglcontextlost", onLost);
    glCanvas.addEventListener("webglcontextrestored", onRestored);
    const pal = terrainPalette(mode);
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const curPos = new THREE.Vector3();
    const curLook = new THREE.Vector3();
    const goalPos = new THREE.Vector3();
    const goalLook = new THREE.Vector3();
    let inited = false;
    let sized = "";
    let raf = 0;
    let last = 0;
    let visible = true;
    let dead = false;

    const goal = (L: typeof live) => {
      const v = L.view;
      if (v.mode === "orbit") {
        const aspect = L.width / Math.max(L.height, 1);
        // Portrait canvases fit the tile to the horizontal field of view: scale the distance by 1 / aspect.
        const fit = aspect < 1 ? 1.6 / Math.max(aspect, 0.3) : Math.min(1.7, 1.4 / aspect);
        const d = v.dist * Math.max(1, Math.min(2.8, fit));
        const az = (v.az * Math.PI) / 180;
        const pt = (v.pitch * Math.PI) / 180;
        goalLook.set(0, 0.35, 0);
        goalPos.set(
          d * Math.cos(pt) * Math.sin(az),
          0.35 + d * Math.sin(pt),
          -d * Math.cos(pt) * Math.cos(az),
        );
      } else {
        const az = (v.lookAz * Math.PI) / 180;
        const pt = (v.lookPitch * Math.PI) / 180;
        const bx = -Math.sin(az) * 0.9;
        const bz = Math.cos(az) * 0.9;
        const ground = sampleHeightM(patch, bx, -bz);
        const gy = ground === null ? 0 : ((ground - patch.centerHM) / 1000) * L.relief;
        const y = Math.max(LANDER_TOP * 0.8, gy + 0.3);
        goalPos.set(bx, y, bz);
        goalLook.set(
          bx + Math.sin(az) * Math.cos(pt) * 10,
          y + Math.sin(pt) * 10,
          bz - Math.cos(az) * Math.cos(pt) * 10,
        );
      }
    };

    const schedule = () => {
      if (!raf && !dead && visible) raf = requestAnimationFrame(frame);
    };
    function frame(t: number) {
      raf = 0;
      if (dead || !visible) return;
      const L = liveRef.current;
      if (L.width <= 0) return;
      const key = `${L.width}x${L.height}`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (key !== sized) {
        sized = key;
        sc.setSize(L.width, L.height);
        hudCanvas!.width = Math.round(L.width * dpr);
        hudCanvas!.height = Math.round(L.height * dpr);
      }
      goal(L);
      if (!inited || reduced) {
        curPos.copy(goalPos);
        curLook.copy(goalLook);
        inited = true;
      } else {
        const dt = Math.min(0.1, Math.max(0.001, (t - last) / 1000));
        const a = 1 - Math.exp(-dt * 9);
        curPos.lerp(goalPos, a);
        curLook.lerp(goalLook, a);
      }
      last = t;
      const moving = curPos.distanceToSquared(goalPos) > 1e-6 || curLook.distanceToSquared(goalLook) > 1e-6;
      sc.update({
        sunAz: L.sunAz,
        sunEl: L.sunEl,
        earthAz: L.earthAz,
        earthEl: L.earthEl,
        sunBlocked: !L.isSunLit,
        earthBlocked: !L.isEarthUp,
        sunBlocker: L.sunBlocker,
        earthBlocker: L.earthBlocker,
        relief: L.relief,
        surface: L.surface,
        psrMask: L.psrMask,
      });
      sc.setLanderVisible(L.view.mode === "orbit");
      sc.setView(curPos, curLook);
      sc.render();
      const ctx = hudCanvas!.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawHud({
          ctx,
          width: L.width,
          height: L.height,
          pal,
          patch: patch!,
          sc,
          sunAz: L.sunAz,
          sunEl: L.sunEl,
          earthAz: L.earthAz,
          earthEl: L.earthEl,
          sunRidgeEl: L.sunRidgeEl,
          earthRidgeEl: L.earthRidgeEl,
          isSunLit: L.isSunLit,
          isEarthUp: L.isEarthUp,
          sunBlocker: L.sunBlocker,
          earthBlocker: L.earthBlocker,
          relief: L.relief,
        });
      }
      if (moving) schedule();
    }
    kickRef.current = schedule;

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined" && wrapRef.current) {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) schedule();
      });
      io.observe(wrapRef.current);
    }
    schedule();
    return () => {
      dead = true;
      kickRef.current = () => {};
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      glCanvas.removeEventListener("webglcontextlost", onLost);
      glCanvas.removeEventListener("webglcontextrestored", onRestored);
      if (sceneRef.current === sc) sceneRef.current = null;
      sc.dispose();
      glCanvas.remove();
    };
    }
  }, [useGl, patch, mode, obsHeightM, ellipseKm, glEpoch]);

  // Horizon and series changes (including every frame of a pin drag) update the sky in place, never the WebGL context.
  useEffect(() => {
    sceneRef.current?.setSky(horizon, tracksOf(series));
    kickRef.current();
  }, [horizon, series, glEpoch, patch, useGl]);

  // Any render (props, toggles, drag) asks for one frame; the loop keeps itself alive only while the camera moves.
  useEffect(() => {
    kickRef.current();
  });

  // ---- Interaction ----------------------------------------------------------------------------------------
  const onPointerDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const v = viewRef.current;
    dragRef.current = {
      x: ev.clientX,
      y: ev.clientY,
      az: v.mode === "orbit" ? v.az : v.lookAz,
      pitch: v.mode === "orbit" ? v.pitch : v.lookPitch,
    };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    ev.currentTarget.focus({ preventScroll: true });
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    setView((v) =>
      v.mode === "orbit"
        ? {
            ...v,
            az: (((d.az - dx * 0.45) % 360) + 360) % 360,
            pitch: Math.max(6, Math.min(88, d.pitch + dy * 0.32)),
          }
        : {
            ...v,
            lookAz: (((d.az + dx * 0.35) % 360) + 360) % 360,
            lookPitch: Math.max(-20, Math.min(60, d.pitch - dy * 0.25)),
          },
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (viewRef.current.mode !== "orbit") return;
      // Page scroll wins unless the user asked to zoom: Ctrl/Cmd+scroll, or the canvas has focus.
      if (!(ev.ctrlKey || ev.metaKey || focusedRef.current)) return;
      ev.preventDefault();
      setView((v) => ({
        ...v,
        dist: Math.max(MIN_DIST, Math.min(MAX_DIST, v.dist * (ev.deltaY > 0 ? 1.1 : 1 / 1.1))),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [unavailable]);

  const sceneElDeg = (el: number) =>
    Math.max(-5, Math.min(60, (Math.atan(relief * Math.tan((Math.max(el, 0) * Math.PI) / 180)) * 180) / Math.PI));
  const lookAt = (az: number, el: number) =>
    setView((v) => ({ ...v, mode: "pov", lookAz: az, lookPitch: sceneElDeg(el) }));
  const toggleCameraMode = () => {
    if (camMode === "orbit") lookAt(sunAz, sunEl);
    else setView(DEFAULT_VIEW);
  };
  const topDown = () => setView((v) => ({ ...v, mode: "orbit", az: 180, pitch: 88, dist: TOP_DOWN_DIST }));
  const resetView = () => setView(DEFAULT_VIEW);

  const summary =
    `3D lunar terrain and sky view, vertical exaggeration ${relief} times. ` +
    `At the cursor the Sun is at azimuth ${sunAz.toFixed(1)}°, elevation ${sunEl.toFixed(1)}° ` +
    `(ridge ${sunRidgeEl.toFixed(1)}°); Earth is at azimuth ${earthAz.toFixed(1)}°, elevation ${earthEl.toFixed(1)}° ` +
    `(ridge ${earthRidgeEl.toFixed(1)}°).${pole ? " At the pole, north points toward 0° longitude." : ""}`;

  const ringKm = ellipseRingKm(ellipseKm, patch?.radiusKm ?? PATCH_RADIUS_KM);
  const notes = patch
    ? terrainNotes({
        patch,
        caption: terrainCaption(patch, relief),
        surface,
        psr: psrStatus,
        ellipseKm,
        ringKm,
        ringClipped: ellipseKm > ringKm + 1e-9,
      })
    : [];

  if (unavailable) {
    return (
      <EmptyState
        isCompact
        title="3D terrain is available for catalog sites and south-polar points within about 190 km of the pole"
        description="The 2D skyline works for every location."
      />
    );
  }

  return (
    <VStack gap={2}>
      <style>{SCROLL_ROW_CSS}</style>
      <Stack
        ref={wrapRef}
        data-testid="lunar-terrain-3d"
        width="100%"
        height={height}
        style={{ position: "relative", touchAction: "pan-y", userSelect: "none", overflow: "hidden" }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={summary}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          tabIndex={0}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height, cursor: "grab" }}
        />
      </Stack>
      <HStack gap={1.5} vAlign="center" wrap="wrap" data-testid="terrain-controls" data-terrain-scroll="true">
        <Button
          label={camMode === "orbit" ? "Lander POV" : "3D Orbit"}
          size="lg"
          variant="secondary"
          onClick={toggleCameraMode}
        />
        <Button label="Top-down" size="lg" variant="ghost" onClick={topDown} />
        <Button label="Look at Sun" size="lg" variant="ghost" onClick={() => lookAt(sunAz, sunEl)} />
        <Button label="Look at Earth" size="lg" variant="ghost" onClick={() => lookAt(earthAz, earthEl)} />
        <Button label="Reset view" size="lg" variant="ghost" onClick={resetView} />
      </HStack>
      {useGl ? (
        <HStack gap={1.5} vAlign="center" wrap="wrap" data-terrain-scroll="true">
          <SegmentedControl
            label="Surface mode"
            size="lg"
            value={surface}
            onChange={(v) => setSurface(v === "slope" ? "slope" : "shaded")}
          >
            <SegmentedControlItem value="shaded" label="Shaded relief" />
            <SegmentedControlItem value="slope" label="Elevation & slope" />
          </SegmentedControl>
          <SegmentedControl
            label="Vertical relief"
            size="lg"
            value={String(relief)}
            onChange={(v) => setRelief(v === "1" ? 1 : DEFAULT_RELIEF)}
          >
            <SegmentedControlItem value="1" label="Relief 1x" />
            <SegmentedControlItem value="3" label="Relief 3x" />
          </SegmentedControl>
          {psrEligible ? (
            <ToggleButton
              label="PSR shading"
              size="lg"
              isPressed={psrOn}
              onPressedChange={(p) => setPsrOn(p)}
            />
          ) : null}
        </HStack>
      ) : null}
      <VStack gap={0.5} data-testid="terrain-notes">
        {notes.map((line) => (
          <Text key={line} type="supporting" size="sm">
            {line}
          </Text>
        ))}
      </VStack>
    </VStack>
  );
}
