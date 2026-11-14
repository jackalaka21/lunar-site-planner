import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GRID_DIR = join(process.cwd(), "public/data/v1/horizons/grid");
const OUT_DIR = join(process.cwd(), "public/data/v1/terrain");

interface GridIndex {
  spacingM: number;
  halfCount: number;
  tilePoints: number;
  nAz: number;
  tiles: string[];
}

const idx: GridIndex = JSON.parse(readFileSync(join(GRID_DIR, "index.json"), "utf8"));
const side = 2 * idx.halfCount + 1; // 191
const dem = new Int16Array(side * side);
dem.fill(-32768);

const tileSet = new Set(idx.tiles);
const tp = idx.tilePoints; // 20
const stride = idx.nAz + 1; // 721

for (const name of tileSet) {
  const [ti, tj] = name.split("_").map(Number);
  const buf = readFileSync(join(GRID_DIR, `${name}.bin`));
  const arr = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  for (let sy = 0; sy < tp; sy++) {
    for (let sx = 0; sx < tp; sx++) {
      const ix = tp * ti + sx - idx.halfCount;
      const iy = tp * tj + sy - idx.halfCount;
      if (Math.abs(ix) > idx.halfCount || Math.abs(iy) > idx.halfCount) continue;
      const slot = sy * tp + sx;
      const h = arr[slot * stride];
      dem[(iy + idx.halfCount) * side + (ix + idx.halfCount)] = h;
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "south-pole-dem.bin");
writeFileSync(outPath, Buffer.from(dem.buffer, dem.byteOffset, dem.byteLength));
writeFileSync(
  join(OUT_DIR, "index.json"),
  JSON.stringify(
    {
      projection: "ps-south-sphere",
      R: 1737400,
      spacingM: idx.spacingM,
      halfCount: idx.halfCount,
      side,
      nodata: -32768,
      source: "Extracted hDemM (metres above 1737.4 km sphere) from LOLA LDEM_80S_40MPP_ADJ horizon grid tiles",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Extracted ${side}x${side} polar DEM (${dem.byteLength} bytes) -> ${outPath}`);
