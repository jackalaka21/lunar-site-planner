"use client";

import type { CSSProperties, ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * Spacing wrapper for wide tables. The Astryx Table already supplies its own labelled, focusable scroll wrapper,
 * so this only neutralises the container's block padding and adds no scroller of its own.
 */
const TABLE_SPACING = { "--container-padding-block-start": "0rem", "--container-padding-block-end": "0rem" } as CSSProperties;

export function ScrollRegion({ children }: { children: ReactNode }) {
  return <VStack style={TABLE_SPACING}>{children}</VStack>;
}
