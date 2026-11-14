"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { parseCoord } from "./coord";

export { parseCoord } from "./coord";
export type { CoordParse } from "./coord";

interface CoordInputProps {
  /** Starting text for the two fields. Remount (change `key`) to load a different point. */
  initialLat: string;
  initialLon: string;
  onCommit: (lat: number, lon: number) => void;
}

/** Custom point as decimal degrees. Applies on Enter or the button; a bad value is marked on its field. */
export function CoordInput({ initialLat, initialLon, onCommit }: CoordInputProps) {
  const [lat, setLat] = useState(initialLat);
  const [lon, setLon] = useState(initialLon);
  const [error, setError] = useState<{ field: "lat" | "lon"; message: string } | null>(null);

  const apply = () => {
    const r = parseCoord(lat, lon);
    if (!r.ok) {
      setError({ field: r.field, message: r.error });
      return;
    }
    setError(null);
    setLat(String(r.lat));
    setLon(String(r.lon));
    onCommit(r.lat, r.lon);
  };
  const status = (field: "lat" | "lon") =>
    error?.field === field ? { type: "error" as const, message: error.message } : undefined;

  return (
    <Stack gap={2} data-testid="coord-input">
      <HStack gap={2} vAlign="start">
        <TextInput
          label="Latitude (°)"
          size="lg"
          value={lat}
          placeholder="-85.3"
          inputMode="decimal"
          status={status("lat")}
          statusVariant="detached"
          onChange={(v) => {
            setLat(v);
            setError(null);
          }}
          onEnter={apply}
        />
        <TextInput
          label="Longitude (°)"
          size="lg"
          value={lon}
          placeholder="31.2"
          inputMode="decimal"
          status={status("lon")}
          statusVariant="detached"
          onChange={(v) => {
            setLon(v);
            setError(null);
          }}
          onEnter={apply}
        />
      </HStack>
      <Text type="supporting" size="xsm">
        Decimal degrees, south and west negative. Longitude 0 to 360 is accepted.
      </Text>
      <Button label="Use these coordinates" size="lg" variant="secondary" icon={<Icon icon={MapPin} />} onClick={apply} />
    </Stack>
  );
}
