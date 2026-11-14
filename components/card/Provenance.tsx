"use client";

import { Text } from "@astryxdesign/core/Text";
import type { HorizonSource } from "../../lib/engine/types";

export function provenanceText(source: HorizonSource): string {
  const horizon =
    source.kind === "site"
      ? `LOLA site profile (mast ${source.mastM} m)`
      : source.kind === "grid"
        ? `LOLA grid, nearest point ${source.distKm.toFixed(1)} km`
        : "smooth sphere — terrain not modelled here";
  return `Horizon: ${horizon} · Ephemeris: DE440`;
}

export function Provenance({ ctx }: { ctx: { source: HorizonSource } }) {
  return (
    <Text type="supporting" size="xsm">
      {provenanceText(ctx.source)}
    </Text>
  );
}
