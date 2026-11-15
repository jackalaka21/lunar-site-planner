import * as THREE from "three";
import type { LocalTerrainPatch } from "../../lib/data/terrain";
import { horizonAt } from "../../lib/engine/horizon";
import type { HorizonProfile } from "../../lib/engine/types";
import type { Rgba, TerrainPalette } from "./palette";
import {
  contourSegments,
  HAZARD_SLOPE_DEG,
  ellipseRingKm,
  ringPointsKm,
  sampleHeightM,
  slopeGridDeg,
  type Blocker,
} from "./terrainModel";

export type SurfaceMode = "shaded" | "slope";

export interface SceneParams {
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
  sunBlocked: boolean;
  earthBlocked: boolean;
  sunBlocker: Blocker | null;
  earthBlocker: Blocker | null;
  /** Vertical exaggeration (1 or 3). */
  relief: number;
  surface: SurfaceMode;
  psrMask: Uint8Array | null;
}

export interface SceneOptions {
  obsHeightM: number;
  ellipseKm: number;
  horizon: HorizonProfile;
  skyTracks: SkyTracks;
}

export interface SkyTracks {
  sunAz: Float32Array;
  sunEl: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
  n: number;
}

/** Distance from the lander to the Sun and Earth direction discs, scene units (km). */
export const RAY_LEN = 13;
/** Radius at which the LOLA horizon profile is drawn, scene units. */
const SKYLINE_RADIUS = 10.4;
/** Height of the enlarged lander symbol, scene units. */
export const LANDER_TOP = 0.66;

/** Unit direction in scene space (X east, Y up, Z south). Elevation is scaled by the relief factor. */
export function sceneDir(azDeg: number, elDeg: number, relief: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return out
    .set(Math.sin(az) * Math.cos(el), relief * Math.sin(el), -Math.cos(az) * Math.cos(el))
    .normalize();
}

function col(c: Rgba | { r: number; g: number; b: number }): THREE.Color {
  return new THREE.Color().setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
}

function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const u = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * u, g: a.g + (b.g - a.g) * u, b: a.b + (b.b - a.b) * u, a: 1 };
}

function strToRgba(s: string): Rgba {
  const m = /([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: 1 } : { r: 128, g: 128, b: 128, a: 1 };
}

interface RayParts {
  solid: THREE.Line;
  dashed: THREE.Line;
  marker: THREE.Mesh;
}

function makeSegLine(dashed: boolean, color: THREE.Color): THREE.Line {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const m = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.28, gapSize: 0.2 })
    : new THREE.LineBasicMaterial({ color });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function setSeg(line: THREE.Line, a: THREE.Vector3 | null, b: THREE.Vector3 | null): void {
  if (!a || !b) {
    line.visible = false;
    return;
  }
  const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  if (line.material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
  line.visible = true;
}

/** The WebGL scene: indexed 101 x 101 (native) terrain mesh, lights, overlays, lander and direction rays. */
export class TerrainGlScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 220);
  /** Scene positions of the Sun and Earth direction discs (for the HUD). */
  readonly sunPos = new THREE.Vector3();
  readonly earthPos = new THREE.Vector3();

  private readonly patch: LocalTerrainPatch;
  private readonly pal: TerrainPalette;
  private readonly opts: SceneOptions;
  private skyHorizon: HorizonProfile;
  private skyTracks: SkyTracks;
  private readonly terrainGroup = new THREE.Group();
  private readonly terrain: THREE.Mesh;
  private readonly contours: THREE.LineSegments;
  private readonly ring: THREE.Line | null;
  private readonly lander = new THREE.Group();
  private readonly dish = new THREE.Group();
  private readonly sunLight = new THREE.DirectionalLight();
  private readonly earthLight = new THREE.DirectionalLight();
  private readonly ambient = new THREE.AmbientLight();
  private readonly sunRay: RayParts;
  private readonly earthRay: RayParts;
  private readonly skyline: THREE.Line;
  private readonly sunTrack: THREE.Line;
  private readonly earthTrack: THREE.Line;
  private readonly slopeDeg: Float32Array;
  private readonly hNorm: Float32Array;
  private relief = 0;
  private paintKey = "";
  private paintMask: Uint8Array | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, patch: LocalTerrainPatch, pal: TerrainPalette, opts: SceneOptions) {
    this.patch = patch;
    this.pal = pal;
    this.opts = opts;
    this.skyHorizon = opts.horizon;
    this.skyTracks = opts.skyTracks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    // three r187 removed PCFSoftShadowMap; PCFShadowMap is the soft-filtered PCF there.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = col(strToRgba(pal.sky));

    const gs = patch.gridSize;
    this.slopeDeg = slopeGridDeg(patch);
    const span = Math.max(100, patch.maxHM - patch.minHM);
    this.hNorm = Float32Array.from(patch.heightsM, (h) => Math.max(0, Math.min(1, (h - patch.minHM) / span)));

    // Indexed mesh at the patch's native resolution.
    const rKm = patch.radiusKm;
    const positions = new Float32Array(gs * gs * 3);
    for (let iy = 0; iy < gs; iy++) {
      const north = ((iy / (gs - 1)) * 2 - 1) * rKm;
      for (let ix = 0; ix < gs; ix++) {
        const east = ((ix / (gs - 1)) * 2 - 1) * rKm;
        const o = (iy * gs + ix) * 3;
        positions[o] = east;
        positions[o + 1] = (patch.heightsM[iy * gs + ix] - patch.centerHM) / 1000;
        positions[o + 2] = -north;
      }
    }
    const indices = new Uint32Array((gs - 1) * (gs - 1) * 6);
    let q = 0;
    for (let iy = 0; iy < gs - 1; iy++) {
      for (let ix = 0; ix < gs - 1; ix++) {
        const a = iy * gs + ix;
        const b = a + 1;
        const c = a + gs;
        const d = c + 1;
        indices[q++] = a;
        indices[q++] = b;
        indices[q++] = c;
        indices[q++] = b;
        indices[q++] = d;
        indices[q++] = c;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(gs * gs * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.terrainGroup.add(this.terrain);

    // Contour lines (shown in the elevation and slope surface).
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.BufferAttribute(contourSegments(patch), 3));
    const cm = new THREE.LineBasicMaterial({
      color: col(pal.contour),
      transparent: true,
      opacity: Math.max(0.35, pal.contour.a),
    });
    this.contours = new THREE.LineSegments(cg, cm);
    this.contours.position.y = 0.012;
    this.contours.visible = false;
    this.terrainGroup.add(this.contours);

    // Landing ellipse draped on the DEM: every ring point samples the terrain height.
    const ringR = ellipseRingKm(opts.ellipseKm, rKm);
    if (ringR > 0.01) {
      // One sample per half grid cell so the ring follows the terrain at large radii.
      const count = Math.max(72, Math.ceil((2 * Math.PI * ringR * 1000) / (patch.spacingM / 2)));
      const pts = ringPointsKm(ringR, count).map((p) => {
        const h = sampleHeightM(patch, p.east, p.north) ?? patch.centerHM;
        return new THREE.Vector3(p.east, (h - patch.centerHM) / 1000 + 0.035, -p.north);
      });
      const rg = new THREE.BufferGeometry().setFromPoints(pts);
      this.ring = new THREE.Line(rg, new THREE.LineDashedMaterial({ color: col(strToRgba(pal.sun)), dashSize: 0.3, gapSize: 0.18 }));
      this.ring.computeLineDistances();
      this.terrainGroup.add(this.ring);
    } else {
      this.ring = null;
    }
    this.scene.add(this.terrainGroup);

    // Lights.
    const sunCol = mix(strToRgba(pal.sun), { r: 255, g: 255, b: 255, a: 1 }, 0.7);
    this.sunLight.color = col(sunCol);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const sc = this.sunLight.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 4;
    sc.far = 130;
    sc.updateProjectionMatrix();
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.04;
    this.earthLight.color = col(mix(strToRgba(pal.earth), { r: 255, g: 255, b: 255, a: 1 }, 0.35));
    this.ambient.color = col(mix(strToRgba(pal.near), strToRgba(pal.earth), 0.25));
    this.scene.add(this.sunLight, this.sunLight.target, this.earthLight, this.earthLight.target, this.ambient);

    this.buildLander();
    this.scene.add(this.lander);

    // Rays, markers, skyline and tracks.
    const sunC = col(strToRgba(pal.sun));
    const earthC = col(strToRgba(pal.earth));
    this.sunRay = this.makeRay(sunC);
    this.earthRay = this.makeRay(earthC);
    this.skyline = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: col(strToRgba(pal.rim)) }));
    this.skyline.frustumCulled = false;
    this.sunTrack = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: sunC, transparent: true, opacity: 0.6 }),
    );
    this.earthTrack = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: earthC, transparent: true, opacity: 0.6 }),
    );
    this.sunTrack.frustumCulled = false;
    this.earthTrack.frustumCulled = false;
    this.scene.add(this.skyline, this.sunTrack, this.earthTrack);
  }

  private makeRay(color: THREE.Color): RayParts {
    const solid = makeSegLine(false, color);
    const dashed = makeSegLine(true, color);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color }));
    marker.visible = false;
    this.scene.add(solid, dashed, marker);
    return { solid, dashed, marker };
  }

  private buildLander(): void {
    const body = new THREE.MeshLambertMaterial({ color: col(mix(strToRgba(this.pal.near), this.pal.textPrimary, 0.55)) });
    const metal = new THREE.MeshLambertMaterial({ color: col(strToRgba(this.pal.rim)) });
    const dishMat = new THREE.MeshLambertMaterial({ color: col(strToRgba(this.pal.earth)), side: THREE.DoubleSide });
    const add = (m: THREE.Mesh) => {
      m.castShadow = true;
      m.receiveShadow = true;
      this.lander.add(m);
      return m;
    };
    const box = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.26), body));
    box.position.y = 0.24;
    const up = new THREE.Vector3(0, 1, 0);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const top = new THREE.Vector3(sx * 0.1, 0.2, sz * 0.1);
        const foot = new THREE.Vector3(sx * 0.22, 0.02, sz * 0.22);
        const dir = foot.clone().sub(top);
        const len = dir.length();
        const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 6), metal));
        leg.position.copy(top).addScaledVector(dir, 0.5);
        leg.quaternion.setFromUnitVectors(up, dir.normalize());
        const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14), metal));
        pad.position.set(foot.x, 0.006, foot.z);
      }
    }
    const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), metal));
    mast.position.y = 0.46;
    this.dish.position.y = 0.62;
    const dishMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.02, 0.05, 20, 1, true), dishMat);
    dishMesh.castShadow = true;
    this.dish.add(dishMesh);
    this.lander.add(this.dish);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  setView(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.camera.position.copy(pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();
  }

  /** Project a scene point to CSS pixel coordinates. */
  project(v: THREE.Vector3, width: number, height: number): { x: number; y: number; visible: boolean } {
    const p = this.tmp2.copy(v).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * width,
      y: (-p.y * 0.5 + 0.5) * height,
      visible: p.z >= -1 && p.z <= 1,
    };
  }

  private paint(surface: SurfaceMode, mask: Uint8Array | null): void {
    const key = `${surface}|${mask ? "psr" : "-"}`;
    if (key === this.paintKey && mask === this.paintMask) return;
    this.paintKey = key;
    this.paintMask = mask;
    const pal = this.pal;
    const far = strToRgba(pal.far);
    const rim = strToRgba(pal.rim);
    const deepest = strToRgba(pal.deepest);
    const attr = this.terrain.geometry.getAttribute("color") as THREE.BufferAttribute;
    const n = this.patch.gridSize * this.patch.gridSize;
    const hazard = { ...pal.hazard, a: 1 };
    const psr = { ...pal.psr, a: 1 };
    for (let i = 0; i < n; i++) {
      const hn = this.hNorm[i];
      let c: Rgba;
      if (surface === "slope") {
        c = mix(deepest, pal.textPrimary, 0.18 + 0.62 * hn);
        if (this.slopeDeg[i] > HAZARD_SLOPE_DEG) c = mix(c, hazard, 0.8);
      } else {
        c = mix(far, rim, 0.5 + 0.3 * hn);
      }
      if (mask && mask[i]) c = mix(c, psr, 0.6);
      const lin = col(c);
      attr.setXYZ(i, lin.r, lin.g, lin.b);
    }
    attr.needsUpdate = true;
    this.contours.visible = surface === "slope";
  }

  private buildSky(k: number): void {
    const o = this.tmp.set(0, 0, 0);
    const sky: THREE.Vector3[] = [];
    for (let az = 0; az <= 360; az += 2) {
      const el = horizonAt(this.skyHorizon, az);
      const r = SKYLINE_RADIUS;
      sky.push(
        new THREE.Vector3(
          o.x + Math.sin((az * Math.PI) / 180) * r,
          Math.tan((el * Math.PI) / 180) * r * k,
          -Math.cos((az * Math.PI) / 180) * r,
        ),
      );
    }
    this.skyline.geometry.dispose();
    this.skyline.geometry = new THREE.BufferGeometry().setFromPoints(sky);
    const t = this.skyTracks;
    const mk = (azA: Float32Array, elA: Float32Array): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < t.n; i++) {
        out.push(sceneDir(azA[i], Math.max(elA[i], -3), k).multiplyScalar(RAY_LEN));
      }
      return out;
    };
    this.sunTrack.geometry.dispose();
    this.sunTrack.geometry = new THREE.BufferGeometry().setFromPoints(mk(t.sunAz, t.sunEl));
    this.earthTrack.geometry.dispose();
    this.earthTrack.geometry = new THREE.BufferGeometry().setFromPoints(mk(t.earthAz, t.earthEl));
  }

  /** Replace the horizon profile and sky tracks (cursor and series changes) without rebuilding the scene. */
  setSky(horizon: HorizonProfile, tracks: SkyTracks): void {
    this.skyHorizon = horizon;
    this.skyTracks = tracks;
    if (this.relief > 0) this.buildSky(this.relief);
  }

  private updateRay(
    r: RayParts,
    az: number,
    el: number,
    blocked: boolean,
    blocker: Blocker | null,
    k: number,
    eyeY: number,
    outPos: THREE.Vector3,
  ): void {
    const origin = this.tmp.set(0, eyeY, 0);
    const dir = sceneDir(az, Math.max(el, 0), k);
    const end = origin.clone().addScaledVector(dir, RAY_LEN);
    outPos.copy(end);
    if (el < 0 || (blocked && !blocker)) {
      setSeg(r.solid, null, null);
      setSeg(r.dashed, origin.clone(), end);
      r.marker.visible = false;
    } else if (blocked && blocker) {
      const p = new THREE.Vector3(blocker.eastKm, ((blocker.heightM - this.patch.centerHM) / 1000) * k + 0.02, -blocker.northKm);
      setSeg(r.solid, origin.clone(), p);
      setSeg(r.dashed, p, end);
      r.marker.position.copy(p);
      r.marker.visible = true;
    } else {
      setSeg(r.solid, origin.clone(), end);
      setSeg(r.dashed, null, null);
      r.marker.visible = false;
    }
  }

  update(p: SceneParams): void {
    const k = p.relief;
    if (k !== this.relief) {
      this.relief = k;
      this.terrainGroup.scale.y = k;
      this.buildSky(k);
    }
    this.paint(p.surface, p.psrMask);

    const sunUp = p.sunEl > 0;
    this.sunLight.intensity = sunUp ? 6 : 0;
    this.sunLight.castShadow = sunUp;
    sceneDir(p.sunAz, Math.max(p.sunEl, 0.05), k, this.sunLight.position).multiplyScalar(60);
    this.earthLight.intensity = p.earthEl > 0 ? 0.35 : 0;
    sceneDir(p.earthAz, Math.max(p.earthEl, 0.05), k, this.earthLight.position).multiplyScalar(60);
    // Low ambient so shadows read at a 1.5 degree Sun; still faintly readable when the Sun is down.
    this.ambient.intensity = sunUp ? 0.3 : 0.18;

    const eyeY = (this.opts.obsHeightM / 1000) * k;
    this.updateRay(this.sunRay, p.sunAz, p.sunEl, p.sunBlocked, p.sunBlocker, k, eyeY, this.sunPos);
    this.updateRay(this.earthRay, p.earthAz, p.earthEl, p.earthBlocked, p.earthBlocker, k, eyeY, this.earthPos);

    // Dish: opens toward Earth along the same scene direction as the Earth ray.
    const ed = sceneDir(p.earthAz, Math.max(p.earthEl, 0), k);
    this.dish.quaternion.setFromUnitVectors(this.tmp.set(0, 1, 0), ed);
  }

  render(): void {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.sunLight.shadow.map?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
