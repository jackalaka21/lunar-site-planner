// Minimal static server for the exported site (`out/`), used by the production e2e project and Lighthouse runs.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.argv[2] ?? 3200);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, {
    "content-type": type,
    "cache-control": file.endsWith("sw.js") ? "no-cache" : "public, max-age=0",
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving out/ on http://localhost:${port}`));
