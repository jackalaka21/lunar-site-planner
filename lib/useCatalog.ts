"use client";

import { useEffect, useState } from "react";
import { browserFetcher } from "./data/fetchers";
import { loadSites, type SiteCatalog } from "./data/sites";

let pending: Promise<SiteCatalog> | null = null;

/** Site catalogue (sites.json, same origin), fetched once per page load. A failed fetch can be retried. */
export function loadCatalogOnce(): Promise<SiteCatalog> {
  if (!pending) {
    pending = loadSites(browserFetcher).catch((e: unknown) => {
      pending = null;
      throw e;
    });
  }
  return pending;
}

/** null until loaded, or if loading failed. */
export function useCatalog(): SiteCatalog | null {
  const [catalog, setCatalog] = useState<SiteCatalog | null>(null);
  useEffect(() => {
    let live = true;
    loadCatalogOnce().then(
      (c) => live && setCatalog(c),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return catalog;
}
