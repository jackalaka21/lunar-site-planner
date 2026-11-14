"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";

import { STAT_STRIP_KEY } from "../../lib/storageKeys";

export { STAT_STRIP_KEY };

export const STAT_STRIP_COPY =
  "On the Moon: the Sun peaks at ~1.5° at the pole (vs ~70° at mid-latitudes on Earth) · a day lasts ~29.5 Earth days · shadows are pitch-black with no air to scatter light.";

const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
// Set on dismissal so the banner closes even when storage is unavailable (private window, blocked site data).
let dismissedThisVisit = false;
function isDismissed(): boolean {
  if (dismissedThisVisit) return true;
  try {
    return window.localStorage.getItem(STAT_STRIP_KEY) === "1";
  } catch {
    return false;
  }
}
// Shown in the static prerender (it is the first thing painted). A returning visitor who dismissed it never sees
// it: a script in <head> marks <html> before first paint and the stylesheet hides the banner.
const serverSnapshot = () => false;

export function StatStrip() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, serverSnapshot);
  const dismiss = () => {
    dismissedThisVisit = true;
    try {
      window.localStorage.setItem(STAT_STRIP_KEY, "1");
    } catch {
      // not persisted; dismissedThisVisit keeps it closed for this visit
    }
    listeners.forEach((l) => l());
  };
  if (dismissed) return null;
  return (
    <Banner
      status="info"
      container="section"
      collapsible={false}
      title={STAT_STRIP_COPY}
      // The built-in dismiss control is smaller than 44, so the action is our own large Button.
      endContent={<Button label="Dismiss" size="lg" variant="ghost" onClick={dismiss} />}
      data-testid="stat-strip"
    />
  );
}
