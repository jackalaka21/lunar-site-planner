"use client";

import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

export interface MetricsBarProps {
  /** Both-hours figure, e.g. "127 h". The largest number on the card. */
  both: string;
  /** Comparison against scenario A, e.g. "−96 h vs A". Omitted on the first card. */
  bothDelta?: string;
  /** Spread of both-hours across horizon and site shifts; absent until the engine returns it. */
  robust?: { min: number; max: number; points: number };
  /** Keep the range line's height before the spread arrives (the static card), so the row below does not drop. */
  reserveRange?: boolean;
  sun: { label?: ReactNode; value: string };
  earth: { label?: ReactNode; value: string };
  sunEl: { label?: ReactNode; value: string };
}

/** Label, figure and delta only: no sparklines, no icons. */
export function MetricsBar({ both, bothDelta, robust, reserveRange, sun, earth, sunEl }: MetricsBarProps) {
  return (
    <VStack gap={3} data-testid="metrics-bar">
      <VStack gap={0.5}>
        <Text type="supporting">Both hours</Text>
        <Text size="3xl" weight="medium" hasTabularNumbers>
          {both}
          {robust && (
            <>
              {" "}
              <Text
                as="span"
                type="supporting"
                size="xsm"
                hasTabularNumbers
                data-testid="robust-range"
              >
                {`(${Math.round(robust.min)}–${Math.round(robust.max)})`}
              </Text>
            </>
          )}
        </Text>
        {bothDelta && (
          <Text type="code" size="xsm" color="secondary" hasTabularNumbers>
            {bothDelta}
          </Text>
        )}
        {robust && (
          <Text type="supporting" size="xsm" data-testid="robust-points">
            {`Range across horizon and site shifts, ${robust.points} points`}
          </Text>
        )}
        {!robust && reserveRange && (
          <Text type="supporting" size="xsm" aria-hidden="true" style={{ visibility: "hidden" }}>
            Range across horizon and site shifts, 00 points
          </Text>
        )}
      </VStack>
      <HStack gap={5} wrap="wrap">
        {[sun, earth, sunEl].map((m, i) => (
          <VStack key={i} gap={0.5}>
            {m.label && <Text type="supporting">{m.label}</Text>}
            <Text type="large" weight="medium" hasTabularNumbers>
              {m.value}
            </Text>
          </VStack>
        ))}
      </HStack>
    </VStack>
  );
}
