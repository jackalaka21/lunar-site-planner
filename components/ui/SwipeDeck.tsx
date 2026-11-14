"use client";

import type { ReactNode } from "react";
import { Carousel } from "@astryxdesign/core/Carousel";

interface SwipeDeckProps {
  label: string;
  children: ReactNode;
}

/**
 * Horizontal swipe deck for the narrow layout. Wraps Astryx Carousel (scroll snap, previous and next
 * buttons). Its docs show no pager dots, so none are drawn; the edge fade is off (no gradients).
 */
export function SwipeDeck({ label, children }: SwipeDeckProps) {
  return (
    <Carousel aria-label={label} hasSnap hasEdgeFade={false} gap={3}>
      {children}
    </Carousel>
  );
}
