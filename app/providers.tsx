"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { ridgelineTheme } from "../theme/ridgeline";

export type ColorMode = "system" | "light" | "dark";

const STORAGE_KEY = "ridgeline.mode";
/** Dark unless the visitor has chosen otherwise (spec 6, principle 6). */
const DEFAULT_MODE: ColorMode = "dark";

interface ModeContextValue {
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
}

const ModeContext = createContext<ModeContextValue>({ mode: DEFAULT_MODE, setMode: () => {} });

export function useColorMode(): ModeContextValue {
  return useContext(ModeContext);
}

function readStoredMode(): ColorMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // storage unavailable (private window, blocked site data): use the default
  }
  return DEFAULT_MODE;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(DEFAULT_MODE);

  useEffect(() => {
    // Reading storage after mount keeps server and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(readStoredMode());
  }, []);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // not persisted; the choice still applies for this visit
    }
  }, []);

  // <Theme> scopes colour-scheme to its own wrapper; the page behind it (body) needs it too.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode === "system" ? "light dark" : mode;
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ModeContext.Provider value={value}>
      <Theme theme={ridgelineTheme} mode={mode}>
        <LinkProvider component={Link}>{children}</LinkProvider>
      </Theme>
    </ModeContext.Provider>
  );
}
