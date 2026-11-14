"use client";

import { Moon, Sun } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useColorMode } from "../app/providers";

/** Dark/light switch. Flips between the two explicit modes; the first click leaves "system". */
export function ThemeToggle() {
  const { mode, setMode } = useColorMode();
  const isDark =
    mode === "dark" ||
    (mode === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  return (
    <IconButton
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      tooltip={isDark ? "Light theme" : "Dark theme"}
      variant="ghost"
      icon={<Icon icon={isDark ? Sun : Moon} />}
      onClick={() => setMode(next)}
    />
  );
}
