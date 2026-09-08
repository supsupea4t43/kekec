import zlib from 'node:zlib';

// Minimal PNG codec. Node ships zlib but no image support, and this project has no
// dependencies (§7: "One script, no framework"), so the build carries its own.
//
// Scope is deliberately narrow: enough to read AWS Terrarium elevation tiles and write
// the pre-rendered terrain image. Non-interlaced, 8-bit, greyscale/RGB/RGBA in;
// 8-bit RGB or palette out. Anything else throws rather than guessing.

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };   // greyscale, RGB, grey+alpha, RGBA

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** @returns {{width:number,height:number,channels:number,data:Buffer}} */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');

  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec 9.2).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      const x = line[i];
      cur[i] =
        filter === 0 ? x :
        filter === 1 ? x + a :
        filter === 2 ? x + b :
        filter === 3 ? x + ((a + b) >> 1) :
        filter === 4 ? x + paeth(a, b, c) :
        (() => { throw new Error(`unknown PNG filter ${filter}`); })();
    }
  }
  return { width, height, channels, data: out };
}

/** 8-bit RGB, one filter byte per row. `rgb` is width*height*3 bytes. */
export function encodePngRgb(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const paethPredict = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * 8-bit greyscale, Paeth-filtered.
 *
 * The filter is the point. An unfiltered elevation grid deflates to about 2.5 bytes per
 * pixel; predicting each sample from its neighbours -- which on terrain is a very good
 * guess -- takes the same data to roughly 0.35. That is the difference between a payload
 * worth shipping and one that is slower than the requests it replaces.
 */
export function encodePngGrey(width, height, grey) {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++) {
    const off = y * (width + 1);
    raw[off] = 4;                                    // Paeth
    for (let i = 0; i < width; i++) {
      const x = grey[y * width + i];
      const a = i > 0 ? grey[y * width + i - 1] : 0;
      const b = y > 0 ? grey[(y - 1) * width + i] : 0;
      const c = y > 0 && i > 0 ? grey[(y - 1) * width + i - 1] : 0;
      raw[off + 1 + i] = (x - paethPredict(a, b, c)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
