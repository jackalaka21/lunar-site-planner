"use client";

import type { CSSProperties, ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * Spacing wrapper for wide tables. The Astryx Table already supplies its own labelled, focusable scroll wrapper,
 * so this neutralises the container's block padding, stops the table bleeding past the content's end edge, and adds no scroller of its own.
 */
const TABLE_SPACING = {
  "--container-padding-block-start": "0rem",
  "--container-padding-block-end": "0rem",
  // Cap the Table's inline bleed on the end side only, so its right edge stays clear of the sticky outline panel.
  "--container-padding-inline-end": "0rem",
} as CSSProperties;

export function ScrollRegion({ children }: { children: ReactNode }) {
  return <VStack style={TABLE_SPACING}>{children}</VStack>;
}
