"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useColorMode } from "../app/providers";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;
// The static export is prerendered without knowing the viewer's scheme.
const serverSnapshot = () => false;

/** Dark/light switch. Flips between the two explicit modes; the first click leaves "system". */
export function ThemeToggle() {
  const { mode, setMode } = useColorMode();
  const systemDark = useSyncExternalStore(
    subscribeToSystemScheme,
    systemPrefersDark,
    serverSnapshot,
  );
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  return (
    <IconButton
      label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      tooltip={isDark ? "Light theme" : "Dark theme"}
      variant="ghost"
      size="lg"
      icon={<Icon icon={isDark ? Sun : Moon} />}
      onClick={() => setMode(isDark ? "light" : "dark")}
    />
  );
}
