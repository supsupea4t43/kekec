// The terrain colour model, shared by the build-time pre-render and (by value, see the
// note below) the runtime tile layer in src/assets/map.js.
//
// Elevation comes from AWS Terrain Tiles (Terrarium), which encode metres in RGB:
//   metres = (R * 256 + G + B / 256) - 32768

/**
 * Hypsometric ramp: light green at sea level to near-black at 2600 m.
 *
 * The stops are weighted towards the lower half deliberately. DEM tiles are downsampled
 * as you zoom out, so at whole-country view a 2864 m summit averages down across its
 * pixel; a ramp spread evenly to 2900 would never reach its dark end at the zoom the map
 * actually opens at.
 *
 * src/assets/map.js carries a copy of this array, because it is an ES5 browser file with
 * no module loader. build.test.js asserts the two stay identical.
 */
export const RAMP = [
  [-40,  [186, 205, 214]],   // water / below sea level
  [0,    [235, 246, 216]],
  [120,  [206, 230, 172]],
  [300,  [172, 208, 136]],
  [500,  [132, 180, 104]],
  [700,  [ 98, 150,  82]],
  [900,  [ 72, 124,  66]],
  [1100, [ 50,  98,  52]],
  [1300, [ 34,  74,  40]],
  [1600, [ 20,  52,  28]],
  [2000, [ 10,  32,  17]],
  [2600, [  3,  14,   8]]
];

export const SHADE_MIN = 0.62;
export const SHADE_MAX = 1.30;

/** Slovenia, with a little padding. Must match SLOVENIA in src/assets/map.js. */
export const SLOVENIA = { south: 45.38, west: 13.30, north: 46.92, east: 16.68 };

/**
 * Ramp as a lookup table, one entry per metre from -100 to 3000.
 * The interpolating version allocates a colour array per pixel, which is fine for one
 * tile and ruinous for two million.
 */
export function buildRampLut() {
  const LO = -100, HI = 3000;
  const lut = new Uint8Array((HI - LO) * 3);
  for (let e = LO; e < HI; e++) {
    let c;
    if (e <= RAMP[0][0]) c = RAMP[0][1];
    else {
      c = RAMP[RAMP.length - 1][1];
      for (let i = 1; i < RAMP.length; i++) {
        if (e <= RAMP[i][0]) {
          const a = RAMP[i - 1], b = RAMP[i];
          const t = (e - a[0]) / (b[0] - a[0]);
          c = [
            a[1][0] + (b[1][0] - a[1][0]) * t,
            a[1][1] + (b[1][1] - a[1][1]) * t,
            a[1][2] + (b[1][2] - a[1][2]) * t
          ];
          break;
        }
      }
    }
    const o = (e - LO) * 3;
    lut[o] = c[0]; lut[o + 1] = c[1]; lut[o + 2] = c[2];
  }
  return { lut, LO, HI };
}

// --- Web Mercator, fractional tile coordinates -----------------------------
export const lonToTileX = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
export const latToTileY = (lat, z) => {
  const r = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
};

/**
 * Paint an elevation grid through the ramp with slope shading, light from the north-west.
 * @param {Float32Array} elev  width*height metres
 * @returns {Uint8Array} width*height*3 RGB
 */
export function renderRelief(elev, width, height, shadeStrength) {
  const { lut, LO, HI } = buildRampLut();
  const rgb = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let e = Math.round(elev[i]);
      if (e < LO) e = LO;
      if (e >= HI) e = HI - 1;
      const li = (e - LO) * 3;

      const xl = elev[y * width + (x > 0 ? x - 1 : 0)];
      const xr = elev[y * width + (x < width - 1 ? x + 1 : width - 1)];
      const yu = elev[(y > 0 ? y - 1 : 0) * width + x];
      const yd = elev[(y < height - 1 ? y + 1 : height - 1) * width + x];

      let sh = 1 + ((xl - xr) + (yu - yd)) * shadeStrength;
      if (sh < SHADE_MIN) sh = SHADE_MIN;
      if (sh > SHADE_MAX) sh = SHADE_MAX;

      const o = i * 3;
      rgb[o]     = Math.min(255, lut[li] * sh);
      rgb[o + 1] = Math.min(255, lut[li + 1] * sh);
      rgb[o + 2] = Math.min(255, lut[li + 2] * sh);
    }
  }
  return rgb;
}
