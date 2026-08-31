// 九宫格面板贴图生成器：黑漆军帐风格 panel / card / button 三张 9-slice PNG + Cocos .meta。
// 零外部依赖（node:zlib 编码 PNG），固定随机种子，可重复生成完全一致的贴图。
//
// 用法：node tools/gen-panels.mjs
// 输出：assets/resources/redesign/panels/{panel-lacquer,card-lacquer,button-gold}.png(+.meta)
// 用途：WarCouncilScreen.skinnedPanel() 以 Sprite.Type.SLICED 拉伸使用，边框值见 SKINS 表。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT_DIR = 'assets/resources/redesign/panels';

// ---------------- PNG 编码 / 自校验 ----------------

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
    raw[y * (width * 4 + 1)] = 0; // filter: None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** 回读校验：签名、逐块 CRC、IDAT 解压后与原像素逐字节一致。 */
function verifyPNG(file, width, height) {
  const buf = fs.readFileSync(file);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error(`${file}: PNG 签名错误`);
  let off = 8;
  const idats = [];
  let w;
  let h;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    const crc = buf.readUInt32BE(off + 8 + len);
    if (crc !== crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]))) throw new Error(`${file}: ${type} CRC 错误`);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    }
    if (type === 'IDAT') idats.push(data);
    off += 12 + len;
  }
  if (w !== width || h !== height) throw new Error(`${file}: 尺寸 ${w}x${h} != ${width}x${height}`);
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
  return sum / (1 - Math.pow(0.5, octaves)); // 归一到 ~0..1
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------------- 纹理绘制 ----------------

/**
 * 通用漆面面板绘制。
 * frame 定义（按到最近边缘的距离 d）：
 *   [0, edge)        外沿暗线
 *   [edge, band)     金属主带（垂直渐变，上亮下暗）
 *   [band, band+1)   暗分隔线
 *   [band+1, inner)  内侧高光细线
 *   > inner          漆面填充：径向基色 + 纵向木纹 fbm + 细颗粒 + 顶部光泽带
 * corner: 四角 45° 金色角花（对角短线 + 方点），只落在不拉伸的角部。
 */
function paintLacquer({ size, border, base, edgeDark, goldTop, goldBottom, bandDark, innerLight, grain, speckle, corner, sheenTop, sheenDepth, seed }) {
  const px = Buffer.alloc(size * size * 4);
  const half = size / 2;
  const [edge, bandEnd, inner] = [1, 3.5, 5.5].map((v) => v); // 距离阈值
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.min(x, y, size - 1 - x, size - 1 - y);
      const i = (y * size + x) * 4;
      let r;
      let g;
      let b;
      if (d < edge) {
        [r, g, b] = edgeDark;
      } else if (d < bandEnd) {
        const t = y / size; // 垂直渐变
        r = goldTop[0] + (goldBottom[0] - goldTop[0]) * t;
        g = goldTop[1] + (goldBottom[1] - goldTop[1]) * t;
        b = goldTop[2] + (goldBottom[2] - goldTop[2]) * t;
        // 金属带上极轻的颗粒
        const k = (hash2(x, y, seed + 5) - 0.5) * 6;
        r += k; g += k; b += k;
      } else if (d < bandEnd + 1) {
        [r, g, b] = bandDark;
      } else if (d < inner) {
        [r, g, b] = innerLight;
      } else {
        // 径向基色：中心微亮 -> 边缘沉
        const nx = (x - half) / half;
        const ny = (y - half) / half;
        const rad = clamp(Math.sqrt(nx * nx + ny * ny), 0, 1);
        const lerp = (a, c) => a + (c - a) * rad;
        let lum = lerp(base[0], base[1]);
        // 纵向木纹：横向频率高、纵向频率低 -> 竖向纹理条
        const wob = Math.sin(y * 0.045 + fbm(x * 0.02, y * 0.008, seed + 7, 2) * 6) * 2.2;
        lum += (fbm((x + wob) * 0.16, y * 0.015, seed, 3) - 0.5) * grain;
        // 细颗粒
        lum += (hash2(x, y, seed + 11) - 0.5) * speckle;
        // 顶部光泽带（漆面受光）
        if (y >= border + 2 && y < border + 2 + sheenDepth) {
          lum += (1 - (y - border - 2) / sheenDepth) * sheenTop;
        }
        r = lum;
        g = lum * 0.86;
        b = lum * 0.68; // 暖褐调
      }
      px[i] = clamp(Math.round(r), 0, 255);
      px[i + 1] = clamp(Math.round(g), 0, 255);
      px[i + 2] = clamp(Math.round(b), 0, 255);
      px[i + 3] = 255;
    }
  }
  // 四角 45° 角花：对角双短线 + 方点，落在角部不拉伸区
  const [c0, c1, c2] = corner;
  const mark = (x, y) => {
    const i = (y * size + x) * 4;
    px[i] = c0; px[i + 1] = c1; px[i + 2] = c2; px[i + 3] = 255;
  };
  const cornerSpan = Math.min(border - 4, 11);
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [size - 1, 0, -1, 1], [0, size - 1, 1, -1], [size - 1, size - 1, -1, -1]]) {
    for (let t = 4; t <= cornerSpan; t += 1) {
      const x = cx + dx * t;
      const y = cy + dy * t;
      // 1.2px 宽的对角线：主像素 + 邻像素（较暗）
      mark(x, y);
      mark(x - dx, y);
      mark(x, y - dy);
    }
    const dot = cornerSpan + 3;
    for (let a = 0; a < 2; a += 1) for (let b2 = 0; b2 < 2; b2 += 1) mark(cx + dx * (dot + a), cy + dy * (dot + b2));
  }
  return px;
}

const SKINS = [
  {
    name: 'panel-lacquer',
    size: 160,
    border: 20,
    paint: {
      size: 160,
      border: 20,
      base: [37, 22],
      edgeDark: [12, 10, 7],
      goldTop: [198, 160, 94],
      goldBottom: [148, 114, 58],
      bandDark: [16, 13, 10],
      innerLight: [96, 75, 43],
      grain: 16,
      speckle: 5,
      corner: [172, 138, 78],
      sheenTop: 7,
      sheenDepth: 28,
      seed: 20260831
    }
  },
  {
    name: 'card-lacquer',
    size: 112,
    border: 14,
    paint: {
      size: 112,
      border: 14,
      base: [34, 23],
      edgeDark: [13, 11, 8],
      goldTop: [138, 108, 62],
      goldBottom: [118, 92, 52],
      bandDark: [16, 13, 10],
      innerLight: [64, 52, 34],
      grain: 12,
      speckle: 4,
      corner: [150, 118, 66],
      sheenTop: 5,
      sheenDepth: 20,
      seed: 20260832
    }
  },
  {
    name: 'button-gold',
    size: 72,
    border: 10,
    paint: {
      size: 72,
      border: 10,
      base: [43, 32],
      edgeDark: [12, 10, 7],
      goldTop: [205, 166, 100],
      goldBottom: [160, 124, 68],
      bandDark: [17, 14, 10],
      innerLight: [78, 63, 42],
      grain: 8,
      speckle: 4,
      corner: [180, 145, 84],
      sheenTop: 6,
      sheenDepth: 12,
      seed: 20260833
    }
  }
];

// ---------------- Cocos .meta ----------------

function uuid() {
  return crypto.randomUUID();
}

function imageMeta(name) {
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
      userData: {
        type: 'texture',
        fixAlphaTransparencyArtifacts: false,
        hasAlpha: true,
        redirect: `${id}@6c48a`
      }
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

for (const skin of SKINS) {
  const rgba = paintLacquer(skin.paint);
  const file = path.join(OUT_DIR, `${skin.name}.png`);
  fs.writeFileSync(file, encodePNG(skin.size, skin.size, rgba));
  fs.writeFileSync(`${file}.meta`, imageMeta(skin.name));
  // 自校验：回读解压，比对像素
  const raw = verifyPNG(file, skin.size, skin.size);
  for (let y = 0; y < skin.size; y += 1) {
    for (let x = 0; x < skin.size; x += 1) {
      const src = (y * skin.size + x) * 4;
      const dst = y * (skin.size * 4 + 1) + 1 + x * 4;
      if (raw[dst] !== rgba[src] || raw[dst + 1] !== rgba[src + 1] || raw[dst + 2] !== rgba[src + 2] || raw[dst + 3] !== rgba[src + 3]) {
        throw new Error(`${file}: 像素校验失败 @ ${x},${y}`);
      }
    }
  }
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`${skin.name}.png  ${skin.size}x${skin.size}  border=${skin.border}  ${kb}KB  校验OK`);
}
console.log(`输出目录: ${OUT_DIR}`);
