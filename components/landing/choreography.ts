/**
 * Pure maths for the landing scroll choreography: act boundaries, layer opacities, where the Moon sits on
 * screen, and which descent frame to show. No DOM access, so it is unit-tested directly.
 */

export const FRAME_COUNT = 120;
/** Act boundaries as a fraction of the scroll track. */
export const ACT1_END = 0.18;
export const ACT2_END = 0.45;
export const ACT3_END = 0.72;
/** Descent frame reached at the end of Act 2. */
export const SCRUB_END_FRAME = 70;
/** Static descent frame used under prefers-reduced-motion. */
export const REDUCED_FRAME = 90;
/** Seconds for the dissolve from the orbital video into descent frame 1. */
export const DISSOLVE_S = 0.6;

/** Where the Moon sits inside the 16:9 source (measured on moon-poster.webp): centre x, centre y, radius, as fractions of width / height. */
export const MOON_SRC = { cx: 0.62, cy: 0.5, r: 0.428 } as const;
export const SRC_ASPECT = 16 / 9;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Exponential smoothing factor for a time step: 1 - e^(-rate * dt). */
export const smoothing = (rate: number, dtS: number): number => 1 - Math.exp(-rate * dtS);

export type Act = 1 | 2 | 3 | 4;
export function actOf(p: number): Act {
  return p < ACT1_END ? 1 : p < ACT2_END ? 2 : p < ACT3_END ? 3 : 4;
}

export interface Layers {
  /** Act 1 rail, leaders and mobile facts. */
  intro: number;
  /** Act 2 capabilities row, 0..1 opacity and 0..1 progress across the act. */
  caps: number;
  capsGlide: number;
  /** Act 3 showcase. */
  showcase: number;
  /** Act 4 horizon and quick-launch. */
  horizon: number;
  /** Brightness of the video / frame layer (dims as the horizon takes over). */
  media: number;
}

export function layersAt(p: number): Layers {
  // Each text layer is fully out before the next starts to come in, so two never overlap at partial opacity.
  return {
    intro: 1 - smoothstep(0.08, 0.16, p),
    caps: smoothstep(0.22, 0.27, p) * (1 - smoothstep(0.38, 0.43, p)),
    capsGlide: clamp01((p - 0.22) / (0.43 - 0.22)),
    showcase: smoothstep(0.45, 0.5, p) * (1 - smoothstep(0.68, 0.72, p)),
    horizon: smoothstep(0.72, 0.8, p),
    media: 1 - 0.78 * smoothstep(0.72, 0.92, p),
  };
}

export interface MoonLayout {
  /** The 16:9 media box, centred on the viewport before the transform. */
  box: { left: number; top: number; width: number; height: number };
  /** transform-origin of the box, in percent. */
  originPct: { x: number; y: number };
  tx: number;
  ty: number;
  scale: number;
  /** Moon centre and radius on screen, CSS px. */
  moon: { x: number; y: number; r: number };
}

/** Desktop breakpoint of the landing layout (CSS px). */
export const WIDE_MIN_PX = 1100;

export function moonLayout(vw: number, vh: number, wide: boolean, p: number): MoonLayout {
  let boxH = vh;
  let boxW = vh * SRC_ASPECT;
  if (boxW < vw) {
    boxW = vw;
    boxH = vw / SRC_ASPECT;
  }
  const glide = smoothstep(0, ACT1_END, p);
  const zoom = smoothstep(ACT1_END, 0.3, p);

  let s0: number;
  let targetX: number;
  let targetY: number;
  if (wide) {
    // Keep about 240 px free to the right of the disc for the leader callouts.
    const sRight = (0.4 * vw - 240) / (MOON_SRC.r * boxH);
    s0 = Math.max(0.45, Math.min(0.83, sRight));
    targetX = vw * (0.5 + 0.1 * (1 - glide));
    targetY = vh * 0.52;
  } else {
    // The whole disc sits in the top 42dvh and is never wider than the viewport.
    const fitH = (0.43 * vh - 84) / (2 * MOON_SRC.r * boxH);
    const fitW = (0.9 * vw) / (2 * MOON_SRC.r * boxH);
    s0 = Math.min(fitH, fitW);
    const m = smoothstep(0.1, 0.2, p);
    targetX = vw / 2;
    targetY = lerp((68 + 0.43 * vh) / 2, vh * 0.5, m);
  }
  // Frames are 16:9 and already cover the stage, so zoom barely past 1: more would only upscale them.
  const s1 = wide ? 1.08 : 1.0;
  const scale = lerp(s0, s1, zoom);
  // Once the frames take over, keep the box covering the viewport horizontally.
  const minX = vw - (1 - MOON_SRC.cx) * boxW * scale;
  const maxX = MOON_SRC.cx * boxW * scale;
  if (minX <= maxX) targetX = lerp(targetX, Math.min(maxX, Math.max(minX, targetX)), zoom);
  if (wide) targetY = lerp(targetY, vh * 0.5, zoom);

  const natX = vw / 2 + (MOON_SRC.cx - 0.5) * boxW;
  const natY = vh / 2 + (MOON_SRC.cy - 0.5) * boxH;
  return {
    box: { left: (vw - boxW) / 2, top: (vh - boxH) / 2, width: boxW, height: boxH },
    originPct: { x: MOON_SRC.cx * 100, y: MOON_SRC.cy * 100 },
    tx: targetX - natX,
    ty: targetY - natY,
    scale,
    moon: { x: targetX, y: targetY, r: MOON_SRC.r * boxH * scale },
  };
}

/** Descent frame (1-based, fractional) the scroll position asks for. */
export function frameTarget(p: number, anchorFrame: number, reduced: boolean): number {
  if (reduced) return REDUCED_FRAME;
  if (p < ACT1_END) return 1;
  if (p < ACT2_END) return lerp(1, SCRUB_END_FRAME, (p - ACT1_END) / (ACT2_END - ACT1_END));
  return anchorFrame;
}

/** Index of the nearest loaded frame to `f` (1-based), or 0 when none is loaded. */
export function nearestLoaded(f: number, loaded: ArrayLike<boolean>): number {
  const target = Math.round(Math.min(FRAME_COUNT, Math.max(1, f)));
  for (let d = 0; d < FRAME_COUNT; d++) {
    const lo = target - d;
    const hi = target + d;
    if (lo >= 1 && loaded[lo]) return lo;
    if (hi <= FRAME_COUNT && loaded[hi]) return hi;
  }
  return 0;
}

/** Order in which frames are fetched: the first, then every 4th, then the rest (up to `max`; `sparse` stops after every 4th). */
export function frameLoadOrder(max = FRAME_COUNT, from = 1, sparse = false): number[] {
  const out: number[] = [];
  for (let i = from; i <= max; i++) if ((i - 1) % 4 === 0) out.push(i);
  if (!sparse) for (let i = from; i <= max; i++) if ((i - 1) % 4 !== 0) out.push(i);
  return out;
}

/** 640 px frames for small or low-density viewports, 1280 px otherwise. */
export function pickFrameSet(viewportWidth: number, dpr: number): 640 | 1280 {
  return viewportWidth * dpr <= 700 ? 640 : 1280;
}

export function frameUrl(size: 640 | 1280, n: number): string {
  return `/landing/descent/${size}/${String(n).padStart(3, "0")}.webp`;
}
