/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { browserFetcher } from "../lib/data/fetchers";
import { createEngineHandlers, evaluateTransferables, type EngineApi } from "./engineHandlers";

const handlers = createEngineHandlers(browserFetcher);

const api: EngineApi = {
  ...handlers,
  async evaluate(req) {
    const r = await handlers.evaluate(req);
    return Comlink.transfer(r, evaluateTransferables(r));
  },
};

Comlink.expose(api);
