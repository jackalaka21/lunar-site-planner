"use client";

import { Keyboard, Pause, Play } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Kbd } from "@astryxdesign/core/Kbd";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Slider } from "@astryxdesign/core/Slider";
import { HStack, Stack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { formatMet } from "../../lib/format";
import { useAppStore } from "../../lib/state/store";
import { formatCalendar, MissionClock } from "../ui/MissionClock";
import { togglePlaying, usePlayback, useTimeKeyboard } from "./usePlayback";

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 3_600_000;
const SPEEDS = [
  { value: "1", label: "1 h/s" },
  { value: "6", label: "6 h/s" },
  { value: "24", label: "1 d/s" },
] as const;

function Shortcuts() {
  return (
    <Stack gap={1}>
      <HStack gap={2} vAlign="center">
        <Kbd keys="left" />
        <Kbd keys="right" />
        <Text>1 hour</Text>
      </HStack>
      <HStack gap={2} vAlign="center">
        <Kbd keys="shift" />
        <Text>+</Text>
        <Kbd keys="left" />
        <Kbd keys="right" />
        <Text>1 day</Text>
      </HStack>
      <HStack gap={2} vAlign="center">
        <Kbd keys="space" />
        <Text>Play or pause</Text>
      </HStack>
    </Stack>
  );
}

/** The one global time control: every scenario card reads the same cursor. */
export function TimeBar() {
  usePlayback();
  useTimeKeyboard();

  const cursorH = useAppStore((s) => s.cursorH);
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speedHps);
  const durationDays = useAppStore((s) => s.settings.durationDays);
  const axis = useAppStore((s) => s.settings.axis);
  const tz = useAppStore((s) => s.settings.displayTz);
  const landingMs = useAppStore((s) => s.scenarios[0]?.t0Ms ?? 0);
  const setCursorH = useAppStore((s) => s.setCursorH);
  const setSpeed = useAppStore((s) => s.setSpeed);

  const end = durationDays * HOURS_PER_DAY;
  const toMs = (h: number) => (axis === "cal" ? landingMs + h * MS_PER_HOUR : h * MS_PER_HOUR);
  const format = (h: number) => (axis === "cal" ? formatCalendar(toMs(h), tz) : formatMet(toMs(h)));

  return (
    <Toolbar
      label="Time controls"
      size="lg"
      gap={3}
      startContent={
        <HStack gap={2} vAlign="center">
          <IconButton
            label={playing ? "Pause" : "Play"}
            size="lg"
            variant="primary"
            icon={<Icon icon={playing ? Pause : Play} />}
            onClick={togglePlaying}
          />
          <SegmentedControl
            label="Playback speed"
            size="lg"
            value={String(speed)}
            onChange={(v: string) => setSpeed(Number(v) as 1 | 6 | 24)}
          >
            {SPEEDS.map((s) => (
              <SegmentedControlItem key={s.value} value={s.value} label={s.label} />
            ))}
          </SegmentedControl>
        </HStack>
      }
      centerContent={
        <Slider
          label="Mission time"
          isLabelHidden
          min={0}
          max={end}
          step={1}
          value={Math.min(Math.round(cursorH), end)}
          onChange={(v: number) => setCursorH(v)}
          formatValue={() => format(cursorH)}
          valueDisplay="none"
        />
      }
      endContent={
        <HStack gap={3} vAlign="center">
          <MissionClock ms={toMs(cursorH)} axis={axis} tz={tz} />
          <Tooltip content={<Shortcuts />} placement="above">
            <IconButton label="Keyboard shortcuts" size="lg" variant="ghost" icon={<Icon icon={Keyboard} />} />
          </Tooltip>
        </HStack>
      }
    />
  );
}
