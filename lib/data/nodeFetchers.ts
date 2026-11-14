// Tests only: reads public/data/v1 from disk. Never import this from browser code.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Fetcher } from "./fetchers";

export function nodeFetcher(root: string = path.join(process.cwd(), "public", "data", "v1")): Fetcher {
  return async (p) => {
    const b = await readFile(path.join(root, p));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
}

export const nodeFetchers: Fetcher = nodeFetcher();
