// Pre-renders the whole-country terrain image at build time.
//
// Why this exists: the runtime layer needs four cross-origin DEM tiles per display tile,
// and the opening view is about six display tiles -- twenty-four requests, measured at
// roughly a second before anything appears. The opening view is the same picture on every
// load, so computing it in every visitor's browser is waste. This renders it once.
//
//   npm run terrain    (network; writes src/assets/terrain-slovenia.png)
//   npm run build      (no network; copies it like any other asset)
//
// The result is also what a reader with no JavaScript sees: §4 says pages must work when
// tiles fail or signal drops, and until now that meant an empty box.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePngGrey } from './lib/png.js';
import { SLOVENIA, lonToTileX, latToTileY } from './lib/terrain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.terrain-cache');
const OUT = path.join(ROOT, 'src', 'assets', 'terrain-slovenia.png');
const META = path.join(ROOT, 'src', 'assets', 'terrain-slovenia.json');

const Z = 10;              // DEM sampling zoom
const DOWNSAMPLE = 2;      // 2x box filter -> antialiased output at half the pixels
const METRES_PER_STEP = 12;
const UA = 'kekec-static-site-build/0.1 (quirkmarketonline@gmail.com)';

async function demTile(z, x, y) {
  const file = path.join(CACHE, `${z}-${x}-${y}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

// --- assemble the elevation grid for the whole bounding box ----------------
const x0 = Math.floor(lonToTileX(SLOVENIA.west, Z));
const x1 = Math.ceil(lonToTileX(SLOVENIA.east, Z));
const y0 = Math.floor(latToTileY(SLOVENIA.north, Z));
const y1 = Math.ceil(latToTileY(SLOVENIA.south, Z));

const gridW = (x1 - x0) * 256;
const gridH = (y1 - y0) * 256;
const total = (x1 - x0) * (y1 - y0);
console.log(`z${Z}: ${x1 - x0} x ${y1 - y0} = ${total} DEM tiles -> ${gridW}x${gridH} px`);

const elev = new Float32Array(gridW * gridH);
let fetched = 0, cached = 0;

for (let ty = y0; ty < y1; ty++) {
  for (let tx = x0; tx < x1; tx++) {
    const wasCached = fs.existsSync(path.join(CACHE, `${Z}-${tx}-${ty}.png`));
    const tile = decodePng(await demTile(Z, tx, ty));
    wasCached ? cached++ : fetched++;
    const ox = (tx - x0) * 256, oy = (ty - y0) * 256;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const p = (y * tile.width + x) * tile.channels;
        elev[(oy + y) * gridW + ox + x] =
          (tile.data[p] * 256 + tile.data[p + 1] + tile.data[p + 2] / 256) - 32768;
      }
    }
  }
  process.stdout.write(`\r  rows ${ty - y0 + 1}/${y1 - y0}  (${fetched} fetched, ${cached} cached)`);
}
console.log();

// --- crop to the exact bounding box ---------------------------------------
const cropX = Math.round((lonToTileX(SLOVENIA.west, Z) - x0) * 256);
const cropY = Math.round((latToTileY(SLOVENIA.north, Z) - y0) * 256);
const cropW = Math.round((lonToTileX(SLOVENIA.east, Z) - lonToTileX(SLOVENIA.west, Z)) * 256);
const cropH = Math.round((latToTileY(SLOVENIA.south, Z) - latToTileY(SLOVENIA.north, Z)) * 256);

// --- box-downsample and quantise to 8 bits ---------------------------------
// What ships is the ELEVATION, not a picture of it. The hillshade is what makes a
// rendered image incompressible -- it is per-pixel noise by construction -- and it is
// also cheap to recompute. Elevation on its own is smooth, so Paeth prediction takes it
// to roughly a third of a byte per pixel. Measured on this grid: 354 KB as elevation
// against 1.8 MB for the same area already shaded.
const outW = Math.floor(cropW / DOWNSAMPLE);
const outH = Math.floor(cropH / DOWNSAMPLE);
const grey = Buffer.alloc(outW * outH);

for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    let sum = 0, n = 0;
    for (let dy = 0; dy < DOWNSAMPLE; dy++) {
      for (let dx = 0; dx < DOWNSAMPLE; dx++) {
        sum += elev[(cropY + y * DOWNSAMPLE + dy) * gridW + cropX + x * DOWNSAMPLE + dx];
        n++;
      }
    }
    // METRES_PER_STEP m per step over 0..3060 m. Finer than the ramp can show.
    const v = Math.round((sum / n) / METRES_PER_STEP);
    grey[y * outW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
}

fs.writeFileSync(OUT, encodePngGrey(outW, outH, grey));
fs.writeFileSync(META, JSON.stringify({
  bounds: SLOVENIA,
  width: outW,
  height: outH,
  metresPerStep: METRES_PER_STEP,
  demZoom: Z,
  note: 'Elevation grid, not an image. 8-bit greyscale; metres = value * metresPerStep.',
  source: 'AWS Terrain Tiles (Terrarium), sampled by src/prerender-terrain.js'
}, null, 2) + '\n');

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`wrote src/assets/terrain-slovenia.png  ${outW}x${outH} elevation grid  ${kb} KB`);
