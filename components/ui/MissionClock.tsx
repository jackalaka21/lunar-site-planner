"use client";

import { Text } from "@astryxdesign/core/Text";
import { formatMet } from "../../lib/format";

interface MissionClockProps {
  /** `met`: milliseconds from landing (negative before it). `cal`: UTC epoch milliseconds. */
  ms: number;
  axis: "met" | "cal";
  /** IANA zone for the calendar axis. Defaults to UTC. */
  tz?: string;
}

export function formatCalendar(ms: number, tz = "UTC"): string {
  const zone = tz.length > 0 ? tz : "UTC";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(ms));
  } catch {
    return formatCalendar(ms, "UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const label = zone === "UTC" ? "UTC" : zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  return `${get("day")} ${get("month")} ${get("year")} ${get("hour")}:${get("minute")} ${label}`;
}

/** The signature: every time shown in the app goes through here, in mono. */
export function MissionClock({ ms, axis, tz }: MissionClockProps) {
  return (
    <Text type="code" hasTabularNumbers>
      {axis === "met" ? formatMet(ms) : formatCalendar(ms, tz)}
    </Text>
  );
}
