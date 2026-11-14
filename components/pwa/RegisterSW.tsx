"use client";

import { useEffect, useRef, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Stack } from "@astryxdesign/core/Stack";

const RELOAD_FALLBACK_MS = 3000;

export const OFFLINE_TEXT = "Offline — showing cached data";
export const UPDATE_TEXT = "New version available — reload";

/**
 * Registers the service worker (production builds only), and shows two banners: one while the browser is
 * offline (navigator.onLine plus the online and offline events), one when a new worker has taken over.
 */
export function RegisterSW() {
  const [offline, setOffline] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // A new worker waits (no skipWaiting) and the Reload button activates it. `waiting` holds that worker.
  const waiting = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const announce = (worker: ServiceWorker | null) => {
      // Only an update counts: on the first install nothing controls the page yet.
      if (worker && sw.controller) {
        waiting.current = worker;
        setUpdated(true);
      }
    };
    let registration: ServiceWorkerRegistration | undefined;
    sw.register("/sw.js").then(
      (reg) => {
        registration = reg;
        announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") announce(installing);
          });
        });
      },
      () => undefined, // without a worker the app still works online
    );

    // After a deploy, a tab that predates it can ask for a chunk that no longer exists.
    const isChunkError = (text: string) =>
      /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
        text,
      );
    const onError = (ev: ErrorEvent) => {
      if (navigator.onLine && isChunkError(`${ev.error?.name ?? ""} ${ev.message}`))
        setUpdated(true);
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = ev.reason as { name?: string; message?: string } | undefined;
      if (navigator.onLine && isChunkError(`${r?.name ?? ""} ${r?.message ?? ""}`)) {
        setUpdated(true);
        void registration?.update().catch(() => undefined);
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const reload = () => {
    const worker = waiting.current;
    if (!worker) {
      window.location.reload();
      return;
    }
    // The new worker takes over, then the page reloads onto it (with a fallback if the hand-over never comes).
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
    worker.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  };

  if (!offline && !updated) return null;
  return (
    <Stack gap={2} data-testid="pwa-status">
      {offline ? (
        <Banner status="info" title={OFFLINE_TEXT} container="section" collapsible={false} />
      ) : null}
      {updated ? (
        <Banner
          status="info"
          title={UPDATE_TEXT}
          container="section"
          collapsible={false}
          endContent={<Button label="Reload" size="lg" variant="secondary" onClick={reload} />}
        />
      ) : null}
    </Stack>
  );
}
