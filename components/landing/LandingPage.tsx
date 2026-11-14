"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import Link from "next/link";
import { useAppStore } from "../../lib/state/store";
import type { Scenario } from "../../lib/state/url";
import {
  CALLOUTS,
  CAPABILITIES,
  LANDING_HEADLINE,
  LANDING_HOOK,
  MONS_MOUTON_COPY,
  REPLAYS,
  REPLAY_COPY,
  RIDGE_COPY,
  SLIP_COPY,
} from "../../lib/landing/copy";
import { ThemeToggle } from "../ThemeToggle";
import {
  ACT1_END,
  ACT2_END,
  ACT3_END,
  DISSOLVE_S,
  FRAME_COUNT,
  REDUCED_FRAME,
  WIDE_MIN_PX,
  clamp01,
  frameTarget,
  layersAt,
  moonLayout,
  nearestLoaded,
  pickFrameSet,
  smoothing,
  lerp,
} from "./choreography";
import { DescentFrames } from "./descentFrames";
import { INITIAL_DRIVE, MoonHeroCanvas } from "./MoonHeroCanvas";
import type { HudDrive } from "./MoonHeroCanvas";

interface ShowcaseStage {
  id: string;
  tabLabel: string;
  badge: string;
  title: string;
  summary: string;
  detail: string;
  /** Sun direction shown by the showcase HUD, degrees. */
  phaseDeg: number;
  /** Descent frame (1-based) the stage tweens to. */
  anchorFrame: number;
  ctaLabel: string;
  scenarios: Scenario[];
}

const T0_2027 = Date.UTC(2027, 0, 14, 6, 0);
const T0_SLIP = Date.UTC(2027, 0, 28, 6, 0);
const MONS_MOUTON: Scenario = {
  key: "a",
  site: { kind: "catalog", id: "artemis3-mons-mouton" },
  t0Ms: T0_2027,
};

const SHOWCASE_STAGES: ShowcaseStage[] = [
  {
    id: "summer",
    tabLabel: "Polar summer",
    badge: MONS_MOUTON_COPY.badge,
    title: MONS_MOUTON_COPY.title,
    summary: MONS_MOUTON_COPY.summary,
    detail: MONS_MOUTON_COPY.detail,
    phaseDeg: -34,
    anchorFrame: 78,
    ctaLabel: "Load Mons Mouton window",
    scenarios: [MONS_MOUTON],
  },
  {
    id: "ridge",
    tabLabel: "Rim occlusion",
    badge: RIDGE_COPY.badge,
    title: RIDGE_COPY.title,
    summary: RIDGE_COPY.summary,
    detail: RIDGE_COPY.detail,
    phaseDeg: 24,
    anchorFrame: 92,
    ctaLabel: "Compare Mons Mouton vs Shackleton",
    scenarios: [MONS_MOUTON, { key: "b", site: { kind: "catalog", id: "shackleton-rim" }, t0Ms: T0_2027 }],
  },
  {
    id: "slip",
    tabLabel: "14-day slip",
    badge: SLIP_COPY.badge,
    title: SLIP_COPY.title,
    summary: SLIP_COPY.summary,
    detail: SLIP_COPY.detail,
    phaseDeg: 58,
    anchorFrame: 104,
    ctaLabel: "Compare 2-week launch slip",
    scenarios: [MONS_MOUTON, { key: "b", site: { kind: "catalog", id: "artemis3-mons-mouton" }, t0Ms: T0_SLIP }],
  },
  {
    id: "replay",
    tabLabel: "Mission replay",
    badge: REPLAY_COPY.badge,
    title: REPLAY_COPY.title,
    summary: REPLAY_COPY.summary,
    detail: REPLAY_COPY.detail,
    phaseDeg: -10,
    anchorFrame: 118,
    ctaLabel: "Replay IM-2 Athena landing",
    scenarios: [{ key: "a", site: { kind: "catalog", id: REPLAYS[0].id }, t0Ms: Date.parse(REPLAYS[0].iso) }],
  },
];

const SHACKLETON_ONLY: Scenario[] = [
  { key: "a", site: { kind: "catalog", id: "shackleton-rim" }, t0Ms: T0_2027 },
];

interface Leader {
  key: keyof typeof CALLOUTS;
  /** Anchor on the disc, as fractions of the Moon radius from its centre. */
  ax: number;
  ay: number;
  scenarios: Scenario[] | undefined;
}

const LEADERS: Leader[] = [
  { key: "jpl", ax: 0.62, ay: -0.62, scenarios: SHOWCASE_STAGES[0].scenarios },
  { key: "replays", ax: 0.9, ay: -0.2, scenarios: SHOWCASE_STAGES[3].scenarios },
  { key: "monsMouton", ax: 0.82, ay: 0.3, scenarios: SHOWCASE_STAGES[0].scenarios },
  { key: "shackleton", ax: 0.55, ay: 0.64, scenarios: SHACKLETON_ONLY },
];

const ACT_LABELS = ["Orbital arrival", "Polar plunge", "Showcase", "Horizon"];
const ACT_STARTS = [0, ACT1_END + 0.01, ACT2_END + 0.01, ACT3_END + 0.04];

const MASK =
  "linear-gradient(to right, transparent 0, black 14%, black 86%, transparent 100%), linear-gradient(to bottom, transparent 0, black 6%, black 94%, transparent 100%)";
const MASK_STYLE: CSSProperties = {
  maskImage: MASK,
  WebkitMaskImage: MASK,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
};
const HORIZON_MASK = "linear-gradient(to bottom, transparent 0, black 38%, black 100%)";

const LN_VARS = {
  "--ln-030305": "rgb(3 3 5)",
  "--ln-05050a": "rgb(5 5 10)",
  "--ln-0a0a0c": "rgb(10 10 12)",
  "--ln-15151a": "rgb(21 21 26)",
  "--ln-9a978f": "rgb(154 151 143)",
  "--ln-a9a69d": "rgb(169 166 157)",
  "--ln-b9b6ad": "rgb(185 182 173)",
  "--ln-d4d1c8": "rgb(212 209 200)",
  "--ln-d9d6cd": "rgb(217 214 205)",
  "--ln-e8e5dd": "rgb(232 229 221)",
  "--ln-f1efe9": "rgb(241 239 233)",
  "--ln-ffb454": "rgb(255 180 84)",
  "--ln-ffc47a": "rgb(255 196 122)",
} as CSSProperties;

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(color:--ln-ffb454) focus-visible:outline-solid";
const BTN_BASE = `inline-flex min-h-[44px] cursor-pointer items-center justify-center px-5 text-[15px] font-medium transition-colors ${FOCUS}`;
const BTN_PRIMARY = `${BTN_BASE} h-[52px] bg-(color:--ln-ffb454) text-(color:--ln-0a0a0c) hover:bg-(color:--ln-ffc47a)`;
const BTN_HAIR = `${BTN_BASE} h-[52px] border border-white/30 bg-(color:--ln-05050a)/70 text-(color:--ln-f1efe9) hover:border-white/60 hover:bg-(color:--ln-15151a)`;
const MONO = "font-[family-name:var(--font-family-code)] tracking-[0.04em]";

function setLayer(el: HTMLElement | null, opacity: number, inertBelow = 0.3) {
  if (!el) return;
  el.style.opacity = String(opacity);
  const off = opacity < inertBelow;
  if (el.inert !== off) el.inert = off;
}

export interface LandingPageProps {
  onEnterPlanner?: (scenarios?: Scenario[]) => void;
}

export function LandingPage({ onEnterPlanner }: LandingPageProps) {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= WIDE_MIN_PX);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [stageId, setStageId] = useState("summer");
  const [horizonSrc, setHorizonSrc] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);
  const capsInnerRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<HTMLDivElement>(null);
  const horizonRef = useRef<HTMLDivElement>(null);
  const horizonUiRef = useRef<HTMLDivElement>(null);
  const driveRef = useRef<HudDrive>({ ...INITIAL_DRIVE });
  const stageRefValue = useRef<ShowcaseStage>(SHOWCASE_STAGES[0]);
  const wideRef = useRef(wide);

  const activeStage = SHOWCASE_STAGES.find((s) => s.id === stageId) ?? SHOWCASE_STAGES[0];
  useEffect(() => {
    stageRefValue.current = activeStage;
  }, [activeStage]);

  const enterPlanner = useCallback(
    (scenarios?: Scenario[]) => {
      if (scenarios && scenarios.length > 0) {
        useAppStore.setState({ scenarios, cursorH: 0, playing: false });
      }
      if (onEnterPlanner) {
        onEnterPlanner(scenarios);
      } else {
        document.querySelector("[data-testid='cards']")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }
    },
    [onEnterPlanner],
  );

  const jumpToAct = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const range = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ACT_STARTS[i] * range, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth >= WIDE_MIN_PX;
      wideRef.current = w;
      setWide(w);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The choreography: scroll progress, smoothed, drives every layer from one requestAnimationFrame loop.
  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    const box = boxRef.current;
    const video = videoRef.current;
    const canvas = frameCanvasRef.current;
    if (!stage || !track || !box || !video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let vw = window.innerWidth;
    let vh = window.innerHeight;
    const frames = new DescentFrames(pickFrameSet(vw, window.devicePixelRatio || 1));
    canvas.width = frames.size;
    canvas.height = Math.round((frames.size * 9) / 16);

    let pTarget = 0;
    let pS = 0;
    let disp = 1;
    let dissolve = 0;
    let lastKey = "";
    let last = performance.now();
    let raf = 0;
    let videoStarted = false;
    let horizonRequested = false;

    const readScroll = () => {
      const r = track.getBoundingClientRect();
      pTarget = clamp01(-r.top / Math.max(1, r.height - vh));
    };
    const onResize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      lastKey = "";
      readScroll();
    };
    readScroll();
    pS = pTarget;
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // Media loads only now, after mount.
    let startTimer = 0;
    const loadFrames = () => {
      if (reduced) frames.start(() => undefined, [REDUCED_FRAME], 1);
      else frames.start(() => undefined);
    };
    if (!reduced) {
      startTimer = window.setTimeout(() => {
        video.src = "/landing/moon-idle.mp4";
        videoStarted = true;
        video.addEventListener("loadeddata", loadFrames, { once: true });
        window.setTimeout(loadFrames, 2500);
      }, 50);
    } else {
      startTimer = window.setTimeout(loadFrames, 50);
    }
    const idleTimer = window.setTimeout(() => requestHorizon(), 8000);
    function requestHorizon() {
      if (horizonRequested) return;
      horizonRequested = true;
      setHorizonSrc("/landing/lunar-horizon.webp");
    }

    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const isWide = wideRef.current;
      const diff = pTarget - pS;
      pS = reduced || Math.abs(diff) < 1e-5 ? pTarget : pS + diff * smoothing(7, dt);
      const p = pS;
      if (p > 0.3) requestHorizon();

      const L = layersAt(p);
      const lay = moonLayout(vw, vh, isWide, p);
      box.style.left = `${lay.box.left}px`;
      box.style.top = `${lay.box.top}px`;
      box.style.width = `${lay.box.width}px`;
      box.style.height = `${lay.box.height}px`;
      box.style.transformOrigin = `${lay.originPct.x}% ${lay.originPct.y}%`;
      box.style.transform = `translate3d(${lay.tx}px, ${lay.ty}px, 0) scale(${lay.scale})`;
      box.style.opacity = String(L.media);
      stage.style.setProperty("--mx", `${lay.moon.x}px`);
      stage.style.setProperty("--my", `${lay.moon.y}px`);
      stage.style.setProperty("--mr", `${lay.moon.r}px`);

      setLayer(introRef.current, L.intro);
      setLayer(capsRef.current, L.caps);
      setLayer(showRef.current, L.showcase);
      setLayer(horizonUiRef.current, L.horizon);
      if (horizonRef.current) {
        horizonRef.current.style.opacity = String(L.horizon);
        horizonRef.current.style.transform = `translateY(${(1 - L.horizon) * 14 + 9}%)`;
      }
      if (capsInnerRef.current) {
        const g = L.capsGlide;
        capsInnerRef.current.style.transform = isWide
          ? `translate3d(${lerp(4, -4, g)}vw, 0, 0)`
          : `translate3d(0, ${lerp(24, -24, g)}px, 0)`;
      }

      const st = stageRefValue.current;
      const d = driveRef.current;
      d.p = p;
      d.w = vw;
      d.h = vh;
      d.mx = lay.moon.x;
      d.my = lay.moon.y;
      d.mr = lay.moon.r;
      d.heroVis = L.intro;
      d.showVis = L.showcase;
      d.phaseDeg = st.phaseDeg;
      d.wide = isWide;

      // Dissolve from the orbital video into descent frame 1, then scrub frames with scroll.
      const need = reduced ? REDUCED_FRAME : 1;
      const dTarget = p >= ACT1_END && frames.loaded[need] ? 1 : 0;
      dissolve = reduced
        ? dTarget
        : dissolve + Math.sign(dTarget - dissolve) * Math.min(Math.abs(dTarget - dissolve), dt / DISSOLVE_S);

      if (videoStarted) {
        const wantPlay = !reduced && !document.hidden && dissolve < 0.999 && p < 0.4;
        if (wantPlay && video.paused) void video.play().catch(() => undefined);
        else if (!wantPlay && !video.paused) video.pause();
      }
      video.style.opacity = dissolve >= 0.999 ? "0" : "1";

      if (dissolve <= 0.001) {
        if (lastKey !== "off") {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.style.opacity = "0";
          lastKey = "off";
        }
        return;
      }
      canvas.style.opacity = "1";
      disp = reduced ? REDUCED_FRAME : disp + (frameTarget(p, st.anchorFrame, false) - disp) * smoothing(6, dt);
      const videoLive = dissolve < 0.999 && !reduced && !video.paused;
      const key = `${Math.round(disp * 40)}:${Math.round(dissolve * 100)}:${videoLive ? Math.floor(now / 40) : 0}`;
      if (key === lastKey) return;
      lastKey = key;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (dissolve < 0.999 && !reduced && video.readyState >= 2) {
        ctx.globalAlpha = 1;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const lo = Math.floor(disp);
      const hi = Math.min(FRAME_COUNT, lo + 1);
      const frac = disp - lo;
      const a = frames.get(lo) ?? frames.get(nearestLoaded(disp, frames.loaded));
      ctx.globalAlpha = dissolve;
      if (a) ctx.drawImage(a, 0, 0, canvas.width, canvas.height);
      const b = frac > 0.03 ? frames.get(hi) : undefined;
      if (b && a) {
        ctx.globalAlpha = dissolve * frac;
        ctx.drawImage(b, 0, 0, canvas.width, canvas.height);
      }
      ctx.globalAlpha = 1;
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(startTimer);
      window.clearTimeout(idleTimer);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
      frames.dispose();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [reduced]);

  const loadMissionReplay = (id: string, iso: string) =>
    enterPlanner([{ key: "a", site: { kind: "catalog", id }, t0Ms: Date.parse(iso) }]);

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SHOWCASE_STAGES.findIndex((s) => s.id === stageId);
    let n = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % SHOWCASE_STAGES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + SHOWCASE_STAGES.length) % SHOWCASE_STAGES.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = SHOWCASE_STAGES.length - 1;
    else return;
    e.preventDefault();
    setStageId(SHOWCASE_STAGES[n].id);
    document.getElementById(`landing-tab-${SHOWCASE_STAGES[n].id}`)?.focus();
  };

  const tabs = (
    <div role="tablist" aria-label="Showcase stage" className="grid grid-cols-2 gap-px border border-white/25 bg-white/25">
      {SHOWCASE_STAGES.map((st, i) => {
        const on = st.id === stageId;
        return (
          <button
            key={st.id}
            id={`landing-tab-${st.id}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls="landing-stage-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => setStageId(st.id)}
            onKeyDown={onTabKey}
            className={`flex min-h-[48px] cursor-pointer items-center gap-2 px-3 text-left text-[13px] ${FOCUS} ${
              on ? "bg-(color:--ln-ffb454) text-(color:--ln-0a0a0c)" : "bg-(color:--ln-0a0a0c) text-(color:--ln-e8e5dd) hover:bg-(color:--ln-15151a)"
            }`}
          >
            <span className={`${MONO} text-[11px] ${on ? "text-(color:--ln-0a0a0c)" : "text-(color:--ln-ffb454)"}`}>0{i + 1}</span>
            {st.tabLabel}
          </button>
        );
      })}
    </div>
  );

  return (
    <div data-testid="landing-page" className="relative w-full bg-(color:--ln-030305) text-(color:--ln-f1efe9) [overflow-x:clip]" style={{ ...LN_VARS, minHeight: "100dvh" }}>
      <div ref={trackRef} className="relative w-full" style={{ height: "450dvh" }}>
        <div
          ref={stageRef}
          data-testid="landing-hero"
          className="sticky top-0 w-full overflow-hidden bg-(color:--ln-030305)"
          style={{ height: "100dvh" }}
        >
          {/* Media: orbital loop, dissolving into the scrubbed descent frames. */}
          <div ref={boxRef} className="absolute will-change-transform" style={MASK_STYLE} aria-hidden="true">
            <video
              ref={videoRef}
              poster="/landing/moon-poster.webp"
              muted
              playsInline
              autoPlay={!reduced}
              loop
              preload="none"
              tabIndex={-1}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <canvas ref={frameCanvasRef} className="absolute inset-0 h-full w-full" style={{ opacity: 0 }} />
          </div>

          <MoonHeroCanvas variant="hero" drive={driveRef} reducedMotion={reduced} />
          <MoonHeroCanvas variant="showcase" drive={driveRef} reducedMotion={reduced} />

          {/* Top bar */}
          <header className="absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-4 lg:px-14">
            <span className="text-[15px] font-semibold tracking-[0.02em]">Ridgeline</span>
            <nav aria-label="Site" className="flex items-center gap-1">
              <Link
                href="/about"
                className={`inline-flex min-h-[44px] items-center px-3 text-[14px] text-(color:--ln-d9d6cd) underline-offset-4 hover:underline ${FOCUS}`}
              >
                About &amp; validation
              </Link>
              <ThemeToggle />
            </nav>
          </header>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-(--ln-030305)/80 to-transparent" />

          {/* Act 1: orbital arrival */}
          <div ref={introRef} className="absolute inset-0 z-10">
            {wide ? (
              <>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-[52%] bg-gradient-to-r from-(--ln-030305) via-(--ln-030305)/80 to-transparent" />
                <nav aria-label="Acts" className="absolute left-5 top-1/2 z-10 -translate-y-1/2">
                  <ol className="relative flex flex-col">
                    <span className="pointer-events-none absolute bottom-[22px] left-[21px] top-[22px] w-px bg-white/25" />
                    {ACT_LABELS.map((label, i) => (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() => jumpToAct(i)}
                          aria-label={`Go to ${label}`}
                          className={`flex h-11 cursor-pointer items-center gap-3 pr-2 ${MONO} text-[12px] ${FOCUS} ${i === 0 ? "text-(color:--ln-ffb454)" : "text-(color:--ln-a9a69d) hover:text-(color:--ln-f1efe9)"}`}
                        >
                          <span className="flex h-11 w-11 items-center justify-center">
                            <span className="bg-(color:--ln-030305) px-1">{`0${i + 1}`}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
                <div className="absolute bottom-[10dvh] left-[84px] z-10 flex w-[min(34rem,40vw)] flex-col gap-6">
                  <p className={`${MONO} text-[12px] text-(color:--ln-ffb454)`}>Lunar landing site planner</p>
                  <h1 className="text-[clamp(2.5rem,4.4vw,4.25rem)] font-medium leading-[1.02] tracking-[-0.025em]">
                    {LANDING_HEADLINE}
                  </h1>
                  <p className="max-w-[30rem] text-[16px] leading-[1.55] text-(color:--ln-d4d1c8)">{LANDING_HOOK}</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className={BTN_PRIMARY} onClick={() => enterPlanner()}>
                      Launch 3D Mission Planner
                    </button>
                    <button type="button" className={BTN_HAIR} onClick={() => enterPlanner(SHOWCASE_STAGES[1].scenarios)}>
                      Mons Mouton vs Shackleton
                    </button>
                  </div>
                </div>
                {LEADERS.map((l) => (
                  <div
                    key={l.key}
                    className="pointer-events-none absolute z-10 flex items-center"
                    style={{
                      left: `calc(var(--mx) + var(--mr) * ${l.ax})`,
                      top: `calc(var(--my) + var(--mr) * ${l.ay})`,
                      transform: "translateY(-50%)",
                    }}
                  >
                    <span className="h-[5px] w-[5px] shrink-0 -translate-x-1/2 rounded-full bg-(color:--ln-f1efe9)" />
                    <span className="-ml-[2px] h-px bg-white/45" style={{ width: `calc(var(--mr) * ${1.07 - l.ax})` }} />
                    <button
                      type="button"
                      onClick={() => enterPlanner(l.scenarios)}
                      className={`pointer-events-auto ml-2 flex min-h-[44px] w-[212px] cursor-pointer flex-col justify-center border-l border-white/45 py-1 pl-3 text-left hover:border-(color:--ln-ffb454) ${FOCUS}`}
                    >
                      <span className={`${MONO} text-[11px] text-(color:--ln-ffb454)`}>{CALLOUTS[l.key].title}</span>
                      <span className="text-[13px] leading-snug text-(color:--ln-f1efe9)">{CALLOUTS[l.key].fact}</span>
                    </button>
                  </div>
                ))}
              </>
            ) : (
              <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-4 px-4 pb-10" style={{ top: "43dvh" }}>
                <h1 className="pt-3 text-[clamp(2rem,9vw,2.6rem)] font-medium leading-[1.04] tracking-[-0.025em]">
                  {LANDING_HEADLINE}
                </h1>
                <p className="text-[14.5px] leading-[1.5] text-(color:--ln-d4d1c8)">{LANDING_HOOK}</p>
                <button type="button" className={`${BTN_PRIMARY} w-full`} onClick={() => enterPlanner()}>
                  Launch 3D Mission Planner
                </button>
                <ul className="grid grid-cols-2 gap-px border border-white/25 bg-white/25">
                  {LEADERS.map((l) => (
                    <li key={l.key} className="flex bg-(color:--ln-030305)">
                      <button
                        type="button"
                        onClick={() => enterPlanner(l.scenarios)}
                        className={`flex min-h-[64px] w-full cursor-pointer flex-col justify-center px-3 py-2 text-left ${FOCUS}`}
                      >
                        <span className={`${MONO} text-[10.5px] text-(color:--ln-ffb454)`}>{CALLOUTS[l.key].title}</span>
                        <span className="text-[12px] leading-snug text-(color:--ln-f1efe9)">{CALLOUTS[l.key].fact}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Act 2: capabilities */}
          <div ref={capsRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10" style={{ opacity: 0 }}>
            <div className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-(--ln-030305) via-(--ln-030305)/80 to-transparent" />
            <div ref={capsInnerRef} className="relative px-4 pb-14 lg:px-14">
              <ol className="grid grid-cols-1 border-t border-white/30 lg:grid-cols-4">
                {CAPABILITIES.map((c, i) => (
                  <li key={c.title} className="border-b border-white/15 py-3 lg:border-b-0 lg:border-l lg:px-5 lg:py-5 lg:first:border-l-0 lg:first:pl-0">
                    <p className={`${MONO} text-[11px] text-(color:--ln-ffb454)`}>{`0${i + 1} / ${c.title}`}</p>
                    <p className="mt-1.5 text-[13px] leading-[1.5] text-(color:--ln-d4d1c8)">{c.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Act 3: showcase */}
          <div ref={showRef} className="pointer-events-none absolute inset-0 z-10" style={{ opacity: 0 }}>
            <div className="absolute inset-y-0 left-0 hidden w-[56%] bg-gradient-to-r from-(--ln-030305)/90 via-(--ln-030305)/70 to-transparent lg:block" />
            <div className="absolute inset-x-0 bottom-0 h-[72%] bg-gradient-to-t from-(--ln-030305) via-(--ln-030305)/85 to-transparent lg:hidden" />
            <div
              id="landing-stage-panel"
              role="tabpanel"
              aria-labelledby={`landing-tab-${stageId}`}
              className="pointer-events-auto absolute inset-x-4 bottom-8 flex flex-col gap-3 lg:inset-x-auto lg:bottom-auto lg:left-14 lg:top-1/2 lg:w-[30rem] lg:-translate-y-1/2 lg:gap-4"
            >
              <p className={`${MONO} hidden text-[12px] text-(color:--ln-ffb454) lg:block`}>03 / Showcase</p>
              {tabs}
              <p data-testid="stage-badge" className={`${MONO} w-fit border border-(color:--ln-ffb454)/70 px-2 py-1 text-[12px] text-(color:--ln-ffb454)`}>
                {activeStage.badge}
              </p>
              <h2 className="text-[19px] font-medium leading-[1.25] lg:text-[24px]">{activeStage.title}</h2>
              <p className="text-[13.5px] leading-[1.5] text-(color:--ln-d4d1c8) lg:text-[14.5px]">{activeStage.summary}</p>
              <p className="hidden text-[13px] leading-[1.5] text-(color:--ln-b9b6ad) lg:block">{activeStage.detail}</p>
              <div>
                <button type="button" className={`${BTN_PRIMARY} w-full lg:w-auto`} onClick={() => enterPlanner(activeStage.scenarios)}>
                  {activeStage.ctaLabel}
                </button>
              </div>
            </div>
          </div>

          {/* Act 4: horizon */}
          <div
            ref={horizonRef}
            data-testid="moon-horizon"
            role="img"
            aria-label="Rendered lunar horizon"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
            style={{ height: "66dvh", opacity: 0, maskImage: HORIZON_MASK, WebkitMaskImage: HORIZON_MASK }}
          >
            {horizonSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={horizonSrc} alt="" decoding="async" className="h-full w-full object-cover object-bottom" />
            ) : null}
          </div>
          <div ref={horizonUiRef} className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-14 lg:px-14" style={{ opacity: 0 }}>
            <div className="pointer-events-auto flex w-full max-w-[56rem] flex-col items-center gap-5 text-center">
              <h2 className="mb-14 text-[clamp(1.6rem,3.4vw,2.6rem)] font-medium leading-tight tracking-[-0.02em]">
                Choose a site and a date
              </h2>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
                <button type="button" className={BTN_PRIMARY} onClick={() => enterPlanner()}>
                  Enter 3D Mission Planner
                </button>
                <button type="button" className={BTN_HAIR} onClick={() => enterPlanner(SHOWCASE_STAGES[2].scenarios)}>
                  Compare 2-week launch slip
                </button>
                <button type="button" className={BTN_HAIR} onClick={() => enterPlanner(SHOWCASE_STAGES[1].scenarios)}>
                  Mons Mouton vs Shackleton rim
                </button>
              </div>
              <div className="grid w-full grid-cols-3 gap-px border border-white/25 bg-white/25 sm:w-auto">
                {REPLAYS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => loadMissionReplay(r.id, r.iso)}
                    className={`flex min-h-[56px] cursor-pointer flex-col items-center justify-center bg-(color:--ln-05050a)/90 px-3 py-2 sm:px-6 ${FOCUS} hover:bg-(color:--ln-15151a)`}
                  >
                    <span className="text-[13px] font-medium text-(color:--ln-f1efe9)">{r.label}</span>
                    <span className={`${MONO} text-[10.5px] text-(color:--ln-a9a69d)`}>{r.iso.slice(0, 10)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className={`${MONO} pointer-events-none absolute bottom-3 left-0 right-0 z-30 text-center text-[11px] text-(color:--ln-9a978f) lg:left-14 lg:right-auto lg:text-left`}>
            Rendered visualization, not mission imagery
          </p>
        </div>
      </div>
    </div>
  );
}
