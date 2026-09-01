#!/usr/bin/env node
/**
 * 修复工具图标"烤入文字"：tool-*.png 裁自参考图时把底部文字带一并裁入，
 * 运行时又叠加代码文字标签，造成"图标带文字 + 又加文字说明"的重复展示。
 *
 * 处理：解码 PNG → 按可见墨迹行聚类，清除图形主簇之后的所有底部簇（即烤入文字）→
 * 按图形包围盒垂直居中 → 原尺寸 40x40 重编码（meta/uuid 不变，代码零改动）。
 * 自校验（内存回读，全部通过后才写盘）：清除线以下无墨迹、墨迹总量守恒、非空。
 *
 * 用法：node tools/trim-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets/resources/redesign/icons');
const FILES = ['tool-terrain', 'tool-power', 'tool-city', 'tool-mark'].map((n) => `${n}.png`);


function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

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
  const mk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mk('IHDR', ihdr),
    mk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    mk('IEND', Buffer.alloc(0))
  ]);
}

/** 解码 PNG（支持 6/2 通道与 0-4 行滤波，还原为 RGBA）；入参为文件路径或 Buffer */
function decodePNG(source) {
  const buf = Buffer.isBuffer(source) ? source : fs.readFileSync(source);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error(`${file}: 签名错误`);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idats = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    off += 12 + len;
  }
  if (colorType !== 6 && colorType !== 2) throw new Error(`${file}: 暂只支持 RGB/RGBA，实际 ${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const img = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const ft = raw[p];
    p += 1;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = Buffer.from(line);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (ft === 1) cur[x] = (cur[x] + a) & 0xff;
      else if (ft === 2) cur[x] = (cur[x] + b) & 0xff;
      else if (ft === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      img[d] = cur[s];
      img[d + 1] = cur[s + 1];
      img[d + 2] = cur[s + 2];
      img[d + 3] = channels === 4 ? cur[s + 3] : 255;
    }
    cur.copy(prev); // prev 必须存"重构后"的行，而非原始滤波数据
  }
  return { width, height, img };
}

function inkBounds(width, height, img) {
  let minY = height;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (img[o + 3] > 60 && (img[o] + img[o + 1] + img[o + 2]) / 3 > 110) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  return { minY, maxY, minX, maxX };
}

const isVisible = (img, o) => img[o + 3] > 60 && (img[o] + img[o + 1] + img[o + 2]) / 3 > 110;

function inkClusters(width, height, img) {
  const rowInk = [];
  for (let y = 0; y < height; y += 1) {
    let n = 0;
    for (let x = 0; x < width; x += 1) if (isVisible(img, (y * width + x) * 4)) n += 1;
    rowInk.push(n);
  }
  const clusters = [];
  let start = null;
  for (let y = 0; y < height; y += 1) {
    if (rowInk[y] > 1 && start === null) start = y;
    else if (rowInk[y] <= 1 && start !== null) {
      clusters.push([start, y - 1]);
      start = null;
    }
  }
  if (start !== null) clusters.push([start, height - 1]);
  return clusters;
}

for (const name of FILES) {
  const file = path.join(dir, name);
  const { width, height, img } = decodePNG(file);
  const before = inkBounds(width, height, img);
  // 1) 识别簇：图形簇之间间隙小（≤7px），文字簇与图形之间间隙大（实测 11-16px）。
  //    从底部向回找第一个间隙 ≥8px 的断点，其后（更底部）的簇均为烤入文字，全部清除。
  const clusters = inkClusters(width, height, img);
  if (clusters.length < 2) {
    console.log(`- ${name}: 仅 ${JSON.stringify(clusters)} 单簇，无底部文字（可能已处理过），跳过`);
    continue;
  }
  const CUT_GAP = 8;
  let keepUntil = height - 1;
  for (let i = clusters.length - 1; i > 0; i -= 1) {
    const gap = clusters[i][0] - clusters[i - 1][1];
    if (gap >= CUT_GAP) {
      keepUntil = clusters[i - 1][1];
      break;
    }
  }
  if (keepUntil >= height - 1) {
    console.log(`- ${name}: 未找到大间隙断点（簇=${JSON.stringify(clusters)}），跳过`);
    continue;
  }
  const clearedBand = keepUntil + 1;
  for (let y = clearedBand; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) img[(y * width + x) * 4 + 3] = 0;
  }
  // 2) 剩余墨迹包围盒垂直居中（整行平移，不做重采样）
  const mid = inkBounds(width, height, img);
  if (mid.maxY < 0) throw new Error(`${name}: 清除后无墨迹，阈值有误`);
  const center = (mid.minY + mid.maxY) / 2;
  const shift = Math.round(height / 2 - center);
  if (shift !== 0) {
    const out = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const ty = y + shift;
      if (ty < 0 || ty >= height) continue;
      img.copy(out, ty * width * 4, y * width * 4, (y + 1) * width * 4);
    }
    out.copy(img);
  }
  // 3) 内存编码回读校验（清除线以下无墨迹 + 总量守恒 + 非空），通过后才写盘
  const count = (im) => {
    let n = 0;
    for (let i = 0; i < im.length; i += 4) if (isVisible(im, i)) n += 1;
    return n;
  };
  const encoded = encodePNG(width, height, img);
  const back = decodePNG(encoded).img;
  const after = inkBounds(width, height, back);
  const clearedBandShifted = clearedBand + shift;
  const dirtyBottom = (() => {
    for (let y = Math.max(0, clearedBandShifted); y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if (isVisible(back, (y * width + x) * 4)) return y;
    }
    return -1;
  })();
  if (dirtyBottom >= 0) throw new Error(`${name}: 校验失败，清除线${clearedBandShifted}以下 y=${dirtyBottom} 仍有墨迹`);
  if (count(back) === 0) throw new Error(`${name}: 校验失败，图标墨迹为空`);
  if (count(back) !== count(img)) throw new Error(`${name}: 校验失败，墨迹总量不守恒(${count(img)}→${count(back)})`);
  fs.writeFileSync(file, encoded);
  console.log(
    `✓ ${name}: ${width}x${height} 簇=${JSON.stringify(clusters)} 保留主簇至 y=${keepUntil}，墨迹 y[${before.minY},${before.maxY}]→[${after.minY},${after.maxY}] 像素${count(back)} 平移${shift}px`
  );
}
console.log('全部完成');
