"use client";

import { useSyncExternalStore } from "react";
import { Banner } from "@astryxdesign/core/Banner";

export const STAT_STRIP_KEY = "lsp.statstrip.dismissed";

export const STAT_STRIP_COPY =
  "On the Moon: the Sun peaks at ~1.5° at the pole (vs ~70° at mid-latitudes on Earth) · a day lasts ~29.5 Earth days · shadows are pitch-black with no air to scatter light.";

const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(STAT_STRIP_KEY) === "1";
  } catch {
    return false;
  }
}
// Hidden in the static prerender so a returning visitor never sees it flash.
const serverSnapshot = () => true;

export function StatStrip() {
  const dismissed = useSyncExternalStore(subscribe, isDismissed, serverSnapshot);
  const dismiss = () => {
    try {
      window.localStorage.setItem(STAT_STRIP_KEY, "1");
    } catch {
      // not persisted; hidden for this visit through the listener below
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
      isDismissable
      dismissLabel="Dismiss"
      onDismiss={dismiss}
      data-testid="stat-strip"
    />
  );
}
