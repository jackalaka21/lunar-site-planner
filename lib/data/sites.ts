import { fetchJson, type Fetcher } from "./fetchers";

export interface Site {
  id: string;
  name: string;
  group: "apollo" | "clps" | "international" | "artemis3" | "polar";
  lat: number;
  lon: number;
  hDemM: number;
  source_url: string;
  notes: string;
  actual_landing_utc?: string;
  actual_landing_source_url?: string;
  outcome?: string;
  horizon: "site";
}

export interface SiteCatalog {
  checkedUtc: string;
  sites: Site[];
  byId: Map<string, Site>;
}

export async function loadSites(f: Fetcher): Promise<SiteCatalog> {
  const doc = await fetchJson<{ checkedUtc: string; sites: Site[] }>(f, "sites.json");
  return { checkedUtc: doc.checkedUtc, sites: doc.sites, byId: new Map(doc.sites.map((s) => [s.id, s])) };
}
