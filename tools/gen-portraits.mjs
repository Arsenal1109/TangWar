// 将领立绘生成器：为全体将领（含唐室与群雄）生成程序化半身像 PNG + Cocos .meta。
// 零外部依赖（node:zlib 编码 PNG），从 data/Generals.ts 提取将领表，固定随机种子，
// 可重复生成完全一致的立绘；正式美术到位后可按同名目录直接替换。
//
// 画风：漆底圆窗 + 势力色披风/官服 + 面容（肤色/须髯/眉目）+ 冠盔（按原型分四式）
//       + 品阶金星（统率 90+ 三星 / 80+ 两星 / 70+ 一星）。
//
// 用法：node tools/gen-portraits.mjs
// 输出：assets/resources/redesign/portraits/<generalId>/texture.png(+.meta)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT_ROOT = 'assets/resources/redesign/portraits';
const GENERALS_TS = 'assets/scripts/data/Generals.ts';
const SIZE = 112; // 立绘边长；UI 中按 22~40px 缩用

// ---------------- PNG 编码（与 gen-panels.mjs 同管线） ----------------

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

function verifyPNG(file, width, height, rgba) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: PNG 签名错误`);
  let off = 8;
  const idats = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) !== buf.readUInt32BE(off + 8 + len)) {
      throw new Error(`${file}: ${type} CRC 错误`);
    }
    if (type === 'IDAT') idats.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idats));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = y * (width * 4 + 1) + 1 + x * 4;
      if (raw[dst] !== rgba[src] || raw[dst + 1] !== rgba[src + 1] || raw[dst + 2] !== rgba[src + 2] || raw[dst + 3] !== rgba[src + 3]) {
        throw new Error(`${file}: 像素校验失败 @ ${x},${y}`);
      }
    }
  }
}

// ---------------- 颜色工具 ----------------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
];
const shade = (c, k) => [
  Math.max(0, Math.min(255, Math.round(c[0] * k))),
  Math.max(0, Math.min(255, Math.round(c[1] * k))),
  Math.max(0, Math.min(255, Math.round(c[2] * k)))
];

// ---------------- 势力 / 原型参数 ----------------

// 势力主色（与 Factions 数据的军旗色一致）
const FACTION_COLORS = {
  tang: '#2f6f4f',
  sui: '#4a5a78',
  wa: '#8a4f2d',
  zheng: '#7a5c26',
  xia: '#345a72',
  chu: '#6b3f66',
  qin: '#8a3434',
  liang: '#3d6f6a',
  liu: '#5a6b34',
  yan: '#6b6b3d',
  wu: '#4f3d6b',
  shen: '#6b4a3d',
  lin: '#4a3d6b',
  none: '#8a7a5a'
};

// 原型决定冠盔与轮廓：ruler 君主冕旒、strategist 谋士纶巾、general 战将兜鍪、empress 凤冠
function archetypeOf(g) {
  if (g.id === 'zhangsunhuanghou') return 'empress';
  if (g.stats.strategy >= 85 && g.stats.valor < 70) return 'strategist';
  if (/(帝|王|可汗|皇后|主|公)/.test(g.title) && g.stats.command >= 55 && g.stats.valor < 90) return 'ruler';
  return 'general';
}

function seedOf(id) {
  let h = 2166136261;
  for (const ch of id) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 面容参数由 id 种子确定（可重复）
function faceParams(id) {
  const s = seedOf(id);
  const rnd = (k) => ((Math.imul(s ^ (k * 0x9e3779b9), 2654435761) >>> 8) % 1000) / 1000;
  return {
    skin: rnd(1),
    faceWidth: 0.86 + rnd(2) * 0.24,     // 脸宽
    jaw: 0.7 + rnd(3) * 0.3,             // 下颌方圆
    beard: rnd(4) < 0.14 ? 0 : Math.floor(rnd(5) * 4), // 0 无须 / 1 短须 / 2 长髯 / 3 络腮
    browAngle: -0.5 + rnd(6) * 1.0,      // 眉峰
    eyeSize: 0.8 + rnd(7) * 0.4,
    hairGray: rnd(8) < 0.22 ? 0.55 : 0   // 少数鬓发斑白
  };
}

// ---------------- 绘制 ----------------

function paintPortrait(g) {
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const put = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    rgba[i] = c[0];
    rgba[i + 1] = c[1];
    rgba[i + 2] = c[2];
    rgba[i + 3] = a;
  };
  const cx = SIZE / 2;
  const faction = FACTION_COLORS[g.faction] ?? '#5a5a5a';
  const base = hex(faction);
  const f = faceParams(g.id);
  const kind = archetypeOf(g);

  // —— 背景：漆底 + 势力色环晕 ——
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx = (x + 0.5 - cx) / cx;
      const dy = (y + 0.5 - cx) / cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      // 圆窗底：深漆由内向外微亮
      const t = Math.min(1, Math.max(0, (d - 0.55) / 0.45));
      let c = mix(hex('#171512'), hex('#2b2620'), t * 0.8);
      // 势力色晕：中环染势力色
      if (d > 0.72) c = mix(c, base, 0.5 * (d - 0.72) / 0.28);
      // 外沿金环
      if (d > 0.965 && d < 0.995) c = hex('#c8a35a');
      if (d >= 0.995) c = [0, 0, 0];
      put(x, y, c, d >= 0.995 ? 0 : 255);
    }
  }

  // —— 披风 / 官服（肩部起，势力色到深色渐变） ——
  const shoulderY = kind === 'empress' ? 74 : 78;
  for (let y = shoulderY; y < SIZE; y += 1) {
    const t = (y - shoulderY) / (SIZE - shoulderY);
    const c = mix(shade(base, 1.08), shade(base, 0.55), t);
    // 肩宽曲线：中间宽、边缘随身体收
    const half = 34 + Math.round(t * 12);
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x += 1) {
      const edge = Math.abs(x - cx) / half;
      if (edge > 1) continue;
      const col = edge > 0.94 ? shade(c, 0.6) : c;
      put(x, y, col, 255);
    }
    // 中缝衣缘（金色窄线）
    for (let x = Math.round(cx - 2); x <= Math.round(cx + 2); x += 1) {
      if (y > shoulderY + 6) put(x, y, hex('#b98f45'), 255);
    }
  }

  // —— 领口 V 区 ——
  for (let y = shoulderY; y < shoulderY + 16; y += 1) {
    const spread = (y - shoulderY) * 1.4;
    for (let x = Math.round(cx - spread - 3); x <= Math.round(cx + spread + 3); x += 1) {
      if (Math.abs(x - cx) > spread) put(x, y, hex('#1d1a16'), 255);
    }
  }

  // —— 颈部 ——
  for (let y = 62; y < shoulderY + 4; y += 1) {
    for (let x = Math.round(cx - 7); x <= Math.round(cx + 7); x += 1) {
      put(x, y, shade(skinColor(f.skin), 0.82), 255);
    }
  }

  // —— 脸（椭圆 + 下颌） ——
  const skin = skinColor(f.skin);
  const faceH = kind === 'empress' ? 30 : 28;
  const faceTop = 30;
  const faceW = Math.round(15 * f.faceWidth);
  for (let y = faceTop; y < faceTop + faceH; y += 1) {
    const t = (y - faceTop) / faceH;
    let halfW = faceW * Math.sqrt(Math.max(0.06, 1 - Math.pow((t - 0.42) / 0.58, 2)));
    if (t > 0.72) halfW *= 1 - (1 - f.jaw) * (t - 0.72) / 0.28 * 0.35;
    for (let x = Math.round(cx - halfW); x <= Math.round(cx + halfW); x += 1) {
      // 侧影：边缘略暗
      const edge = Math.abs(x - cx) / Math.max(1, halfW);
      put(x, y, shade(skin, 1 - edge * edge * 0.16), 255);
    }
  }

  // —— 冠盔 ——
  drawHeaddress(kind, cx, faceTop, f, put, base);

  // —— 五官 ——
  const eyeY = faceTop + 13;
  const eyeDX = Math.round(6 * f.faceWidth);
  const eyeH = Math.max(1, Math.round(1.6 * f.eyeSize));
  for (let dy = -eyeH; dy <= eyeH; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      // 眉（按 browAngle 倾斜）
      const browShift = Math.round(dy === -eyeH - 1 ? 0 : f.browAngle * 1.5);
      put(cx - eyeDX + dx + browShift, eyeY + dy - eyeH - 1, hex('#241d16'), 255);
      put(cx + eyeDX + dx - browShift, eyeY + dy - eyeH - 1, hex('#241d16'), 255);
      // 眼
      if (Math.abs(dy) <= eyeH - 1) {
        put(cx - eyeDX + dx, eyeY + dy, hex('#17120d'), 255);
        put(cx + eyeDX + dx, eyeY + dy, hex('#17120d'), 255);
      }
    }
  }
  // 鼻 / 口
  for (let y = eyeY + 3; y <= eyeY + 5; y += 1) put(cx, y, shade(skin, 0.86), 255);
  const mouthY = eyeY + 8;
  for (let dx = -3; dx <= 3; dx += 1) put(cx + dx, mouthY, shade(hex('#8a5a4a'), 0.9), 255);

  // —— 须髯 ——
  const beardColor = mix(hex('#241d16'), hex('#6a655c'), f.hairGray);
  if (f.beard >= 1) {
    const len = f.beard === 1 ? 5 : f.beard === 2 ? 11 : 9;
    for (let y = mouthY + 2; y < mouthY + 2 + len; y += 1) {
      const t = (y - mouthY - 2) / len;
      const halfW = Math.round((4 - t * 1.6) * f.faceWidth);
      for (let dx = -halfW; dx <= halfW; dx += 1) put(cx + dx, y, shade(beardColor, 1 - t * 0.2), 255);
      // 络腮：连到两颊
      if (f.beard === 3 && t < 0.5) {
        for (let dx = -eyeDX - 2; dx <= eyeDX + 2; dx += 1) {
          if (Math.abs(dx) > halfW) put(cx + dx, y - 1, beardColor, 255);
        }
      }
    }
    // 髭
    for (let dx = -4; dx <= 4; dx += 1) {
      if (Math.abs(dx) > 1) put(cx + dx, mouthY - 2, beardColor, 255);
    }
  }

  // —— 品阶金星（统率） ——
  const stars = g.stats.command >= 90 ? 3 : g.stats.command >= 80 ? 2 : g.stats.command >= 70 ? 1 : 0;
  for (let s = 0; s < stars; s += 1) {
    const sx = Math.round(cx - (stars - 1) * 3 + s * 6);
    drawStar(sx, shoulderY + 6, 2, hex('#e0b95c'), put);
  }

  return rgba;
}

function skinColor(t) {
  const pale = hex('#e8c39a');
  const tan = hex('#c99b6e');
  return mix(pale, tan, t);
}

function drawHeaddress(kind, cx, faceTop, f, put, factionBase) {
  const gray = mix(hex('#1c1712'), hex('#777168'), f.hairGray);
  if (kind === 'ruler') {
    // 冕冠：平顶金沿 + 垂旒
    for (let y = faceTop - 9; y <= faceTop - 3; y += 1) {
      for (let x = cx - 14; x <= cx + 14; x += 1) put(x, y, hex('#8a1f1c'), 255);
    }
    for (let x = cx - 16; x <= cx + 16; x += 1) put(x, faceTop - 3, hex('#c8a35a'), 255);
    for (let x = cx - 18; x <= cx + 18; x += 2) {
      put(x, faceTop - 1, hex('#c8a35a'), 255);
      put(x, faceTop, hex('#b98f45'), 255);
    }
  } else if (kind === 'general') {
    // 兜鍪：半圆盔体 + 盔缨 + 护额
    for (let y = faceTop - 12; y <= faceTop - 1; y += 1) {
      const t = (y - (faceTop - 12)) / 11;
      const halfW = Math.round(16 * Math.sqrt(Math.max(0.15, 1 - Math.pow(1 - t, 2))));
      for (let x = cx - halfW; x <= cx + halfW; x += 1) {
        const c = shade(hex('#3a3f45'), 1 - (1 - t) * 0.25);
        put(x, y, c, 255);
      }
    }
    for (let x = cx - 16; x <= cx + 16; x += 1) put(x, faceTop, hex('#c8a35a'), 255);
    // 盔缨（势力色）
    for (let y = faceTop - 18; y < faceTop - 10; y += 1) {
      const spread = Math.max(1, 3 - (faceTop - 10 - y));
      for (let dx = -spread; dx <= spread; dx += 1) put(cx + dx, y, shade(factionBase, 1.1), 255);
    }
  } else if (kind === 'strategist') {
    // 纶巾：束发软巾，中央隆起
    for (let y = faceTop - 10; y <= faceTop - 1; y += 1) {
      const t = (y - (faceTop - 10)) / 9;
      const halfW = Math.round(14 * (0.55 + 0.45 * Math.sin(Math.min(1, t) * Math.PI * 0.75)));
      for (let x = cx - halfW; x <= cx + halfW; x += 1) put(x, y, shade(hex('#2c2a26'), 1 - t * 0.12), 255);
    }
    for (let x = cx - 15; x <= cx + 15; x += 1) put(x, faceTop, hex('#b98f45'), 255);
    // 巾带垂肩
    for (let y = faceTop; y < faceTop + 14; y += 1) {
      put(cx - 15 - Math.round((y - faceTop) * 0.3), y, shade(factionBase, 0.9), 255);
      put(cx + 15 + Math.round((y - faceTop) * 0.3), y, shade(factionBase, 0.9), 255);
    }
  } else {
    // 凤冠：金冠 + 珠饰
    for (let y = faceTop - 11; y <= faceTop - 2; y += 1) {
      const t = (y - (faceTop - 11)) / 9;
      const halfW = Math.round(15 * (0.7 + 0.3 * Math.sin(Math.min(1, t) * Math.PI)));
      for (let x = cx - halfW; x <= cx + halfW; x += 1) put(x, y, hex('#a8862f'), 255);
    }
    for (const dx of [-8, -3, 3, 8]) put(cx + dx, faceTop - 5, hex('#d8b95c'), 255);
    // 鬓发
    for (let y = faceTop - 6; y < faceTop + 12; y += 1) {
      for (const s of [-1, 1]) {
        for (let dx = 0; dx < 4; dx += 1) put(cx + s * (14 + dx), y, gray, 255);
      }
    }
  }
  // 常规鬓发（无须者补两鬓）
  if (kind !== 'empress') {
    for (let y = faceTop - 2; y < faceTop + 10; y += 1) {
      for (const s of [-1, 1]) {
        for (let dx = 0; dx < 3; dx += 1) {
          put(cx + s * (faceW0(f) + dx), y, gray, 255);
        }
      }
    }
  }
}

let faceWidthCache = 15;
function faceW0(f) { return Math.round(15 * f.faceWidth) - 1; }

function drawStar(x, y, r, c, put) {
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy <= r * r) put(x + dx, y + dy, c, 255);
    }
  }
}

// ---------------- meta / 主流程 ----------------

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

// 从 Generals.ts 提取将领表（数据文件格式固定，正则即可）
function loadGenerals() {
  const src = fs.readFileSync(GENERALS_TS, 'utf8');
  const generals = [];
  const re = /id: '([a-z]+)', name: '([^']+)', title: '([^']+)', faction: '([a-z]+)', loyalty: \d+, stats: \{ command: (\d+), politics: \d+, strategy: (\d+), valor: (\d+)/g;
  let m;
  while ((m = re.exec(src)) != null) {
    generals.push({
      id: m[1], name: m[2], title: m[3], faction: m[4],
      stats: { command: Number(m[5]), strategy: Number(m[6]), valor: Number(m[7]) }
    });
  }
  if (generals.length < 25) throw new Error(`将领提取不足（${generals.length}），检查 Generals.ts 格式`);
  return generals;
}

const generals = loadGenerals();
fs.mkdirSync(OUT_ROOT, { recursive: true });
if (!fs.existsSync(`${OUT_ROOT}.meta`)) fs.writeFileSync(`${OUT_ROOT}.meta`, directoryMeta());

let totalBytes = 0;
for (const g of generals) {
  const dir = path.join(OUT_ROOT, g.id);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(`${dir}.meta`)) fs.writeFileSync(`${dir}.meta`, directoryMeta());
  const rgba = paintPortrait(g);
  const file = path.join(dir, 'texture.png');
  fs.writeFileSync(file, encodePNG(SIZE, SIZE, rgba));
  fs.writeFileSync(`${file}.meta`, imageMeta('texture'));
  verifyPNG(file, SIZE, SIZE, rgba);
  totalBytes += fs.statSync(file).size;
}
console.log(`立绘 ${generals.length} 张 · ${SIZE}x${SIZE} · 共 ${(totalBytes / 1024).toFixed(0)}KB · 输出 ${OUT_ROOT}`);
