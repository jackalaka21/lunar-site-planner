"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import * as THREE from "three";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/HStack";
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

export interface LunarTerrain3DProps {
  horizon: HorizonProfile;
  series: TimeSeries;
  cursorIndex: number;
  lat: number;
  lon: number;
  hDemM?: number;
  /** Catalogue site id; its real LOLA patch is loaded. Omit for a custom point. */
  siteId?: string;
  obsHeightM: number;
  ellipseKm?: number;
  pole?: boolean;
  height?: number;
  onScrubTime?: (deltaMs: number) => void;
}

const PATCH_RADIUS_KM = 10;
const VERT_EXAG = 3.2;
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

function parseRgb(color: string): [number, number, number] {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
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
export function terrainCaption(patch: LocalTerrainPatch): string {
  const size = `${2 * patch.radiusKm} × ${2 * patch.radiusKm} km`;
  const vert = `vertical ×${VERT_EXAG}`;
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
  height = 260,
}: LunarTerrain3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [patchState, setPatchState] = useState<{ key: string; patch: LocalTerrainPatch | null } | null>(null);
  const [camMode, setCamMode] = useState<"orbit" | "pov">("orbit");
  const [orbitAz, setOrbitAz] = useState(215);
  const [orbitPitch, setOrbitPitch] = useState(26);
  const [orbitDist, setOrbitDist] = useState(21.5);
  const dragRef = useRef<{ x: number; y: number; az: number; pitch: number } | null>(null);
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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const patch = patchState && patchState.key === patchKey ? patchState.patch : null;
  const unavailable = patchState !== null && patchState.key === patchKey && patchState.patch === null;

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
        const dhKm = ((patch.heightsM[iy * gs + ix] - patch.centerHM) / 1000) * VERT_EXAG;
        verts[iy * gs + ix] = new THREE.Vector3(eastKm, dhKm, zKm);
      }
    }
    return { gs, verts };
  }, [patch]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || !patch || !meshData) return;
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
    const camera = new THREE.PerspectiveCamera(42, width / Math.max(height, 1), 0.1, 120);
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
      const lookAzRad = (orbitAz * Math.PI) / 180;
      const lookPitchRad = ((orbitPitch - 18) * Math.PI) / 180;
      const mastY = Math.max(0.28, (obsHeightM / 1000) * VERT_EXAG + 0.25);
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
    const ringRadiusKm = Math.max(0.75, Math.min(4.5, ellipseKm));
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
    const mastHeightKm = Math.max(0.28, (obsHeightM / 1000) * VERT_EXAG + 0.22);
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

    // Bottom-left plain-English status legend
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = withAlpha(pal.rim, 0.7);
    ctx.fillText(
      "Local terrain only; ridge values come from terrain up to 200 km away",
      10,
      height - 40,
    );
    ctx.fillStyle = pal.rim;
    ctx.fillText(terrainCaption(patch), 10, height - 24);

    const statusLine =
      `Sun ${isSunLit ? "clear of" : "behind"} ${sunRidgeEl.toFixed(1)}° ridge · ` +
      `Earth ${isEarthUp ? "clear of" : "behind"} ${earthRidgeEl.toFixed(1)}° ridge · Drag to orbit 3D view`;
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

  const onPointerDown = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      x: ev.clientX,
      y: ev.clientY,
      az: orbitAz,
      pitch: orbitPitch,
    };
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    setOrbitAz(((d.az - dx * 0.45) % 360 + 360) % 360);
    setOrbitPitch(Math.max(6, Math.min(72, d.pitch + dy * 0.32)));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const onWheel = (ev: ReactWheelEvent<HTMLCanvasElement>) => {
    if (camMode !== "orbit") return;
    setOrbitDist((prev) => Math.max(11, Math.min(34, prev + (ev.deltaY > 0 ? 1.5 : -1.5))));
  };

  const toggleCameraMode = () => {
    if (camMode === "orbit") {
      setCamMode("pov");
      setOrbitAz(sunAz);
      setOrbitPitch(20);
    } else {
      setCamMode("orbit");
      setOrbitAz(215);
      setOrbitPitch(26);
    }
  };

  const resetView = () => {
    setCamMode("orbit");
    setOrbitAz(215);
    setOrbitPitch(26);
    setOrbitDist(21.5);
  };

  const summary =
    `3D lunar terrain and sky view, vertical exaggeration ${VERT_EXAG} times. ` +
    `At the cursor the Sun is at azimuth ${sunAz.toFixed(1)}°, elevation ${sunEl.toFixed(1)}° ` +
    `(ridge ${sunRidgeEl.toFixed(1)}°); Earth is at azimuth ${earthAz.toFixed(1)}°, elevation ${earthEl.toFixed(1)}° ` +
    `(ridge ${earthRidgeEl.toFixed(1)}°).${pole ? " At the pole, north points toward 0° longitude." : ""}`;

  if (unavailable) {
    return (
      <EmptyState
        isCompact
        title="3D terrain is available for catalog sites and south-polar points"
        description="The 2D skyline works for every location."
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      data-testid="lunar-terrain-3d"
      style={{
        position: "relative",
        width: "100%",
        height,
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={summary}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height,
          cursor: "grab",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
        }}
      >
        <HStack gap={1.5} vAlign="center">
          <Button
            label={camMode === "orbit" ? "Lander POV" : "3D Orbit"}
            size="lg"
            variant="secondary"
            onClick={toggleCameraMode}
          />
          <Button label="Reset 3D" size="lg" variant="ghost" onClick={resetView} />
        </HStack>
      </div>
    </div>
  );
}
