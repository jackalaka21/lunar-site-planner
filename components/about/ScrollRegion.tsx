"use client";

import type { ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";

/**
 * Horizontal scroll container for wide tables. Keyboard-focusable so the region can be scrolled without a pointer,
 * with bottom padding so the scrollbar track never overlaps what follows.
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <VStack
      role="region"
      aria-label={label}
      tabIndex={0}
      style={{
        overflowX: "auto",
        maxWidth: "100%",
        paddingBottom: "0.75rem",
        marginBottom: "1rem",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </VStack>
  );
}
