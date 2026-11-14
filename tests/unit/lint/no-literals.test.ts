import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const CANVAS_DIRS = ["components/panorama", "components/timeline", "components/picker/projection", "components/calendar"];

function walk(dir: string): string[] {
  let out: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out = out.concat(walk(p));
      else if (/\.(tsx?|css)$/.test(name)) out.push(p);
    }
  } catch {
    // directory absent
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
const files = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))];
const isCanvas = (f: string) => CANVAS_DIRS.some((d) => rel(f).startsWith(d));

describe("no literals", () => {
  it("has no hex colour literals in components or app", () => {
    const bad = files.filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, "utf8"))).map(rel);
    expect(bad).toEqual([]);
  });
  it("has no px literals outside canvas modules", () => {
    const bad = files
      .filter((f) => !isCanvas(f))
      .filter((f) => /\b\d+(\.\d+)?px\b/.test(readFileSync(f, "utf8")))
      .map(rel);
    expect(bad).toEqual([]);
  });
  it("has no uppercase-tracked styling or emoji in UI copy", () => {
    const targets = [...files, join(ROOT, "lib/glossary.ts")];
    const bad = targets
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return /text-transform|uppercase|tracking-(wide|wider|widest)|letter-spacing|\p{Extended_Pictographic}/u.test(s);
      })
      .map(rel);
    expect(bad).toEqual([]);
  });
  it("has no exclamation marks in glossary copy", () => {
    expect(readFileSync(join(ROOT, "lib/glossary.ts"), "utf8")).not.toContain("!");
  });
});
