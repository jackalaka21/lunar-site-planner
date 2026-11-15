import type { Site } from "./data/sites";

/** Display name of each catalogue group. Shared by the live cards and the build-time prerender. */
export const GROUP_LABEL: Record<Site["group"], string> = {
  apollo: "Apollo",
  clps: "CLPS",
  international: "Other agencies and companies",
  artemis3: "Artemis III",
  polar: "Polar",
};
