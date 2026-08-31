// 氛围特效贴图生成器：烛光暖光、云影、扫光条三张 PNG + Cocos .meta。
// 零外部依赖（node:zlib 编码 PNG），固定随机种子，可重复生成完全一致的贴图。
//
// 用法：node tools/gen-effects.mjs
// 输出：assets/resources/redesign/effects/{glow-warm,cloud-soft,sweep-gold}.png(+.meta)
// 用途：传令印信烛光呼吸 / 地图云影漂移 / 军议卡选中扫光。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT_DIR = 'assets/resources/redesign/effects';

// ---------------- PNG 编码 / 自校验（同 gen-panels） ----------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function verifyPNG(file, width, height) {
  const buf = fs.readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error(`${file}: 签名错误`);
  let off = 8;
  const idats = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) throw new Error(`${file}: ${type} CRC`);
    if (type === 'IHDR') { if (data.readUInt32BE(0) !== width || data.readUInt32BE(4) !== height) throw new Error(`${file}: 尺寸错误`); }
    if (type === 'IDAT') idats.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  if (raw.length !== (width * 4 + 1) * height) throw new Error(`${file}: IDAT 长度错误`);
  return raw;
}

// ---------------- 确定性噪声 ----------------
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, seed, octaves) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * f, y * f, seed + i * 101) * amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------- 三张特效贴图 ----------------

function paintGlow(size, seed) {
  const px = Buffer.alloc(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.sqrt((x - half) * (x - half) + (y - half) * (y - half)) / half;
      const t = clamp(1 - d, 0, 1);
      const a = Math.pow(t, 2.0) * 255;
      const i = (y * size + x) * 4;
      const flick = (hash2(x, y, seed) - 0.5) * 6; // 轻微不均
      px[i] = 255;
      px[i + 1] = clamp(190 + t * 42 + flick, 0, 255);
      px[i + 2] = clamp(118 + t * 44 + flick, 0, 255);
      px[i + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return px;
}

function paintCloud(w, h, seed) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = fbm(x / 58, y / 58, seed, 4) * 0.6 + fbm(x / 26 + 40, y / 26, seed + 7, 3) * 0.4;
      // 外围淡出，让云独立成团
      const ex = (x / w - 0.5) * 2;
      const ey = (y / h - 0.5) * 2;
      const mask = clamp(1 - Math.sqrt(ex * ex + ey * ey), 0, 1) ** 1.4;
      const d = clamp((n - 0.44) / (0.62 - 0.44), 0, 1) * mask;
      const a = d * 96;
      const i = (y * w + x) * 4;
      px[i] = 236;
      px[i + 1] = 233;
      px[i + 2] = 225;
      px[i + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return px;
}

function paintSweep(w, h) {
  const px = Buffer.alloc(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const hx = Math.abs(x - cx) / cx;
      const vy = Math.abs(y - cy) / cy;
      const bx = Math.pow(clamp(1 - hx * hx, 0, 1), 1.6); // 左右软渐变，中心亮
      const vy2 = 1 - clamp(vy, 0, 1) ** 2 * 0.5; // 上下微柔
      const a = bx * vy2 * 214;
      const i = (y * w + x) * 4;
      px[i] = 252;
      px[i + 1] = 224;
      px[i + 2] = 156;
      px[i + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return px;
}

// ---------------- Cocos .meta ----------------
const uuid = () => crypto.randomUUID();
function imageMeta(name, w, h) {
  const id = uuid();
  return `${JSON.stringify(
    {
      ver: '1.0.27',
      importer: 'image',
      imported: true,
      uuid: id,
      files: ['.json', '.png'],
      subMetas: {
        '6c48a': {
          importer: 'texture',
          uuid: `${id}@6c48a`,
          displayName: name,
          id: '6c48a',
          name: 'texture',
          userData: {
            wrapModeS: 'clamp',
            wrapModeT: 'clamp',
            minfilter: 'linear',
            magfilter: 'linear',
            mipfilter: 'none',
            anisotropy: 0,
            isUuid: true,
            imageUuidOrDatabaseUri: id,
            visible: false
          },
          ver: '1.0.22',
          imported: true,
          files: ['.json'],
          subMetas: {}
        }
      },
      userData: { type: 'texture', fixAlphaTransparencyArtifacts: false, hasAlpha: true, redirect: `${id}@6c48a` }
    },
    null,
    2
  )}\n`;
}
function directoryMeta() {
  return `${JSON.stringify(
    { ver: '1.2.0', importer: 'directory', imported: true, uuid: uuid(), files: [], subMetas: {}, userData: {} },
    null,
    2
  )}\n`;
}

// ---------------- 主流程 ----------------
fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(`${OUT_DIR}.meta`)) fs.writeFileSync(`${OUT_DIR}.meta`, directoryMeta());

const effects = [
  { name: 'glow-warm', w: 128, h: 128, paint: () => paintGlow(128, 20260834) },
  { name: 'cloud-soft', w: 256, h: 128, paint: () => paintCloud(256, 128, 20260835) },
  { name: 'sweep-gold', w: 96, h: 128, paint: () => paintSweep(96, 128) }
];

for (const eff of effects) {
  const rgba = eff.paint();
  const file = path.join(OUT_DIR, `${eff.name}.png`);
  fs.writeFileSync(file, encodePNG(eff.w, eff.h, rgba));
  fs.writeFileSync(`${file}.meta`, imageMeta(eff.name, eff.w, eff.h));
  const raw = verifyPNG(file, eff.w, eff.h);
  if (raw.length !== (eff.w * 4 + 1) * eff.h) throw new Error(`${file}: 像素长度错误`);
  console.log(`${eff.name}.png  ${eff.w}x${eff.h}  ${(fs.statSync(file).size / 1024).toFixed(1)}KB  校验OK`);
}
console.log(`输出目录: ${OUT_DIR}`);
