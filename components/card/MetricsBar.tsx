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
  /** Range across the robustness variants, e.g. "88 to 104 h". */
  robustRange?: string;
  sun: { label?: ReactNode; value: string };
  earth: { label?: ReactNode; value: string };
  sunEl: { label?: ReactNode; value: string };
}

/** Label, figure and delta only: no sparklines, no icons. */
export function MetricsBar({ both, bothDelta, robustRange, sun, earth, sunEl }: MetricsBarProps) {
  return (
    <VStack gap={3} data-testid="metrics-bar">
      <VStack gap={0.5}>
        <Text type="supporting">Both hours</Text>
        <Text size="3xl" weight="medium" hasTabularNumbers>
          {both}
        </Text>
        {bothDelta && (
          <Text type="code" size="xsm" color="secondary" hasTabularNumbers>
            {bothDelta}
          </Text>
        )}
        {robustRange && (
          <Text type="supporting" size="xsm">
            {`Range ${robustRange} across horizon and site shifts`}
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
