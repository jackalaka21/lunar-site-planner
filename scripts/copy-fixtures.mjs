// Copies pipeline fixtures into tests/fixtures (the TS engine tests read them from there).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["engine_cases.json"];
const outDir = resolve(root, "tests/fixtures");
mkdirSync(outDir, { recursive: true });
for (const f of files) {
  const src = resolve(root, "pipeline/fixtures", f);
  if (!existsSync(src)) {
    console.error(`copy-fixtures: missing ${src}; run python -m lsp.fixtures in pipeline/`);
    process.exit(1);
  }
  copyFileSync(src, resolve(outDir, f));
  console.log(`copy-fixtures: ${f} -> tests/fixtures/${f}`);
}
