"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEngine, type EvaluateResult } from "./engineClient";
import type { RobustnessResult } from "./engine/robustness";
import type { Settings } from "./engine/settings";
import type { Scenario } from "./state/url";
import { recordEvaluateTiming } from "./timing";

export type Slot =
  | { status: "loading"; result: null }
  /** `stale`: a newer request is in flight and `result` is from the previous inputs. */
  | { status: "ready"; result: EvaluateResult; robust?: RobustnessResult; stale: boolean }
  | { status: "error"; result: null; message: string };

const ROBUST_DELAY_MS = 400;

/** Settings that change engine output. Display-only ones (axis, timezone) must not trigger a recompute. */
function engineSettings(s: Settings): Settings {
  return { ...s, axis: "met", displayTz: "UTC" };
}

/**
 * Evaluate every scenario in the engine worker. Each scenario has its own request counter, so a slow
 * stale response never overwrites a newer one. Returns the slots by scenario key and a retry function.
 */
export function useScenarioResults(scenarios: Scenario[], settings: Settings): {
  slots: Record<string, Slot>;
  retry: (key: string) => void;
} {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [nonce, setNonce] = useState<Record<string, number>>({});
  const requestIds = useRef<Record<string, number>>({});
  const signatures = useRef<Record<string, string>>({});

  const engSettings = useMemo(() => engineSettings(settings), [settings]);
  const settingsSig = useMemo(() => JSON.stringify(engSettings), [engSettings]);

  const retry = useCallback((key: string) => setNonce((n) => ({ ...n, [key]: (n[key] ?? 0) + 1 })), []);

  useEffect(() => {
    const live = new Set(scenarios.map((s) => s.key));
    for (const sc of scenarios) {
      const sig = `${JSON.stringify(sc.site)}|${sc.t0Ms}|${settingsSig}|${nonce[sc.key] ?? 0}`;
      if (signatures.current[sc.key] === sig) continue;
      signatures.current[sc.key] = sig;
      const id = (requestIds.current[sc.key] ?? 0) + 1;
      requestIds.current[sc.key] = id;
      const current = () => requestIds.current[sc.key] === id;

      setSlots((prev) => {
        const old = prev[sc.key];
        return {
          ...prev,
          [sc.key]:
            old && old.status === "ready" ? { ...old, stale: true } : { status: "loading", result: null },
        };
      });

      const engine = getEngine();
      const started = performance.now();
      engine
        .evaluate({ ref: sc.site, t0Ms: sc.t0Ms, settings: engSettings })
        .then((result) => {
          recordEvaluateTiming(performance.now() - started);
          if (!current()) return;
          setSlots((prev) => ({ ...prev, [sc.key]: { status: "ready", result, stale: false } }));
          // Robustness is secondary: fetch it after the headline numbers, and ignore a failure.
          setTimeout(() => {
            if (!current()) return;
            engine
              .robustness({ ref: sc.site, t0Ms: sc.t0Ms, settings: engSettings })
              .then((robust) => {
                if (!current()) return;
                setSlots((prev) => {
                  const slot = prev[sc.key];
                  return slot && slot.status === "ready" ? { ...prev, [sc.key]: { ...slot, robust } } : prev;
                });
              })
              .catch(() => undefined);
          }, ROBUST_DELAY_MS);
        })
        .catch((e: unknown) => {
          if (!current()) return;
          // Forget the signature so the next render with the same inputs does not skip a retry.
          signatures.current[sc.key] = "";
          setSlots((prev) => ({
            ...prev,
            [sc.key]: { status: "error", result: null, message: e instanceof Error ? e.message : String(e) },
          }));
        });
    }
    // Drop state of removed scenarios so a re-added key starts clean.
    for (const k of Object.keys(requestIds.current)) {
      if (!live.has(k)) {
        delete requestIds.current[k];
        delete signatures.current[k];
        setSlots((prev) => {
          if (!(k in prev)) return prev;
          const rest = { ...prev };
          delete rest[k];
          return rest;
        });
      }
    }
  }, [scenarios, engSettings, settingsSig, nonce]);

  return { slots, retry };
}
