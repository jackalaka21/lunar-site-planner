// Gzipped size of the JavaScript the home page loads (script tags in out/index.html, nomodule polyfills excluded).
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const html = readFileSync("out/index.html", "utf8");
let total = 0;
for (const m of html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)) {
  if (/noModule/i.test(m[0])) continue;
  total += gzipSync(readFileSync("out" + m[1])).length;
}
const kb = total / 1024;
console.log(`first view JS: ${kb.toFixed(1)} KB gzipped (budget 250)`);
if (kb > 250) process.exitCode = 1;
