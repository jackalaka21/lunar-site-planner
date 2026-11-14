"use client";

import { Check, CircleAlert, X } from "lucide-react";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import type { Verdict } from "../../lib/engine/metrics";

const LOOK = {
  good: { text: "Good", variant: "success", glyph: Check },
  marginal: { text: "Marginal", variant: "neutral", glyph: CircleAlert },
  poor: { text: "Poor", variant: "error", glyph: X },
} as const;

/** Verdict as dot + shape + word, so colour is never the only signal. The reason is in a tooltip. */
export function VerdictChip({ verdict, reason }: { verdict: Verdict; reason: string }) {
  const look = LOOK[verdict];
  return (
    <Tooltip content={reason} touchTrigger="tap" placement="below">
      <HStack gap={1.5} vAlign="center">
        <StatusDot variant={look.variant} label={`Verdict: ${look.text}`} icon={<Icon icon={look.glyph} />} />
        <Text type="label" weight="medium">
          {look.text}
        </Text>
      </HStack>
    </Tooltip>
  );
}
