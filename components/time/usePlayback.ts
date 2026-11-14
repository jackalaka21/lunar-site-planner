"use client";

import { useEffect } from "react";
import { useAppStore } from "../../lib/state/store";

const HOURS_PER_DAY = 24;
const MS_PER_SECOND = 1000;
/** Longest frame gap counted as elapsed time, so a stalled tab cannot jump the cursor. */
const MAX_FRAME_MS = 1000;

/**
 * Drives `cursorH` while `playing`: speedHps x elapsed seconds per animation frame.
 * Stops (playing = false) at the mission end and pauses while the document is hidden.
 * There is no easing, so prefers-reduced-motion needs no separate path: the cursor steps
 * linearly either way.
 */
export function usePlayback(): void {
  const playing = useAppStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    let last: number | null = null;

    const tick = (t: number) => {
      frameId = 0;
      if (last !== null) {
        const dtS = Math.min(t - last, MAX_FRAME_MS) / MS_PER_SECOND;
        const { cursorH, speedHps, settings, setCursorH, setPlaying } = useAppStore.getState();
        const end = settings.durationDays * HOURS_PER_DAY;
        const next = cursorH + speedHps * dtS;
        if (next >= end) {
          setCursorH(end);
          setPlaying(false);
          return;
        }
        setCursorH(next);
      }
      last = t;
      frameId = requestAnimationFrame(tick);
    };

    const start = () => {
      last = null;
      if (frameId === 0) frameId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [playing]);
}

/** Play or pause. Pressing play at the very end restarts from T+0. */
export function togglePlaying(): void {
  const { playing, cursorH, settings, setCursorH, setPlaying } = useAppStore.getState();
  if (!playing && cursorH >= settings.durationDays * HOURS_PER_DAY) setCursorH(0);
  setPlaying(!playing);
}

/** Moves the cursor by `deltaH`, clamped to the mission window. */
export function stepCursor(deltaH: number): void {
  const { cursorH, settings, setCursorH } = useAppStore.getState();
  setCursorH(Math.min(settings.durationDays * HOURS_PER_DAY, Math.max(0, cursorH + deltaH)));
}

/** Focus targets that keep their own keys: text entry, listboxes and the Astryx Slider (it handles arrows itself). */
const OWN_KEYS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="textbox"], [role="combobox"], [role="listbox"]';
/** A focused button or link already turns Space into a click, so Space is left to it. */
const ACTIVATES_ON_SPACE = 'button, a[href], [role="button"], [role="radio"], [role="tab"], [role="switch"], [role="checkbox"]';

/**
 * Global shortcuts: Left/Right = 1 h, Shift+Left/Right = 1 d, Space = play/pause.
 * Ignored with a modifier (ctrl, alt, meta), when the event target is a text field or the
 * slider, and, for Space only, when a button already owns it.
 */
export function useTimeKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(OWN_KEYS)) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const step = e.shiftKey ? HOURS_PER_DAY : 1;
        e.preventDefault();
        stepCursor(e.key === "ArrowRight" ? step : -step);
      } else if (e.key === " " || e.code === "Space") {
        if (target?.closest(ACTIVATES_ON_SPACE)) return;
        e.preventDefault();
        togglePlaying();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
