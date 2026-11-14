"use client";

import { useEffect, useRef, useState } from "react";
import { getEngine } from "./engineClient";
import type { EventKind } from "./engine/events";
import type { Settings } from "./engine/settings";
import type { SiteRef } from "./state/url";

export type Countdowns = Record<EventKind, number | null>;

export const NO_COUNTDOWNS: Countdowns = { sunset: null, sunrise: null, earthset: null, earthrise: null };

const PLAYBACK_THROTTLE_MS = 250;

/**
 * Next Sun and Earth events after `fromMs`. While playing, at most one request per 250 ms (a trailing
 * throttle, so the last position is always requested); when paused, immediately. Stale responses are
 * dropped by request id. Returns the last good value while a new one is loading.
 */
export function useCountdowns(
  ref: SiteRef,
  fromMs: number | null,
  settings: Settings,
  playing: boolean,
  enabled: boolean,
): Countdowns {
  const [value, setValue] = useState<Countdowns>(NO_COUNTDOWNS);
  const requestId = useRef(0);
  const lastSent = useRef(0);
  const refKey = JSON.stringify(ref);
  const settingsKey = JSON.stringify({ ...settings, axis: "met", displayTz: "UTC", panel: undefined });

  useEffect(() => {
    if (!enabled || fromMs === null) return;
    const send = () => {
      const id = ++requestId.current;
      lastSent.current = performance.now();
      getEngine()
        .countdowns({ ref, fromMs, settings })
        .then((c) => {
          if (id === requestId.current) setValue(c);
        })
        .catch(() => undefined);
    };
    if (!playing) {
      send();
      return;
    }
    const wait = Math.max(0, PLAYBACK_THROTTLE_MS - (performance.now() - lastSent.current));
    const timer = setTimeout(send, wait);
    return () => clearTimeout(timer);
    // ref and settings are covered by their serialised keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey, settingsKey, fromMs, playing, enabled]);

  return value;
}
