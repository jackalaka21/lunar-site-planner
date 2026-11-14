"use client";

import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { landingDate, landingTime, parseLanding } from "./landing";

interface LandingTimeProps {
  id: string;
  /** Scenario letter, for the field labels. */
  letter: string;
  t0Ms: number;
  onCommit: (t0Ms: number) => void;
}

/**
 * Landing date (YYYY-MM-DD) and time (HH:MM), both UTC. Astryx DateTimeInput is not used: its calendar and clock
 * toggles are smaller than the 44 px touch target, so two lg text fields carry the same entry. A valid pair is
 * applied as it is typed; an invalid one stays on screen with the field marked, until it is fixed or the landing
 * changes elsewhere.
 */
export function LandingTime({ id, letter, t0Ms, onCommit }: LandingTimeProps) {
  const [edit, setEdit] = useState<{ base: number; date: string; time: string } | null>(null);
  const live = edit && edit.base === t0Ms ? edit : null;
  const date = live?.date ?? landingDate(t0Ms);
  const time = live?.time ?? landingTime(t0Ms);
  const parsed = parseLanding(date, time);

  const change = (next: { date: string; time: string }) => {
    setEdit({ base: t0Ms, ...next });
    const r = parseLanding(next.date, next.time);
    if (r.ok && r.t0Ms !== t0Ms) onCommit(r.t0Ms);
  };
  const status = (field: "date" | "time") =>
    !parsed.ok && parsed.field === field ? { type: "error" as const, message: parsed.error } : undefined;

  return (
    <HStack gap={2} vAlign="start">
      <TextInput
        id={id}
        label={`Landing date ${letter} (UTC)`}
        isLabelHidden
        size="lg"
        value={date}
        placeholder="YYYY-MM-DD"
        inputMode="numeric"
        status={status("date")}
        statusVariant="detached"
        onChange={(v) => change({ date: v, time })}
      />
      <TextInput
        label={`Landing time ${letter} (UTC)`}
        isLabelHidden
        size="lg"
        value={time}
        placeholder="HH:MM"
        inputMode="numeric"
        status={status("time")}
        statusVariant="detached"
        onChange={(v) => change({ date, time: v })}
      />
    </HStack>
  );
}
