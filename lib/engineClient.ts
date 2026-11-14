import * as Comlink from "comlink";
import type { EngineApi } from "../workers/engineHandlers";

export type { EngineApi, EvaluateResult } from "../workers/engineHandlers";

let engine: Comlink.Remote<EngineApi> | null = null;

/** Singleton engine worker. Browser only: call from effects or event handlers, never during SSR. */
export function getEngine(): Comlink.Remote<EngineApi> {
  if (!engine) {
    const worker = new Worker(new URL("../workers/engine.worker.ts", import.meta.url), { type: "module" });
    engine = Comlink.wrap<EngineApi>(worker);
  }
  return engine;
}
