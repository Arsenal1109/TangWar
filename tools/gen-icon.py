#!/usr/bin/env python3
# 应用图标 / 启动图生成器：黑漆底 + 朱砂印章 + 金边 +「唐」字（霞鹜文楷真字形）。
# 零第三方渲染依赖：fontTools 只用于提取 TTF 字形轮廓（二次曲线），扫描线填充
# （非零环绕规则）栅格化，PNG 用 zlib 自编码。
#
# 产出：
#   native/engine/android/res/mipmap-*/ic_launcher.png   （48/72/96/144/192，直接进仓库）
#   native/engine/android/res/drawable-nodpi/ic_launcher_foreground.png （自适应图标前景 432px）
#   native/engine/android/res/mipmap-anydpi-v26/ic_launcher.xml + values 颜色
#   build-assets/icon/icon-512.png                        （商店 512×512）
#   build-assets/icon/splash-844x390.png                  （启动图，构建面板里选它）
#
# 用法：PYTHONPATH=temp/pylibs python3 tools/gen-icon.py
import math
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp", "pylibs"))

from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.pens.recordingPen import RecordingPen  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "temp", "LXGWWenKai-Medium.ttf")
CHAR = u"唐"

LACQUER = (23, 21, 18, 255)
SEAL_RED = (150, 38, 30, 255)
SEAL_RED_DARK = (112, 27, 21, 255)
GOLD = (200, 163, 90, 255)
PAPER = (235, 219, 178, 255)


# ---------------- PNG 编码（RGBA） ----------------

def encode_png(width, height, rgba):
    def chunk(ctype, data):
        out = struct.pack(">I", len(data)) + ctype + data
        out += struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF)
        return out
    raw = b""
    for y in range(height):
        raw += b"\x00" + bytes(rgba[y * width * 4:(y + 1) * width * 4])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def save(path, width, height, rgba):
    full = os.path.join(ROOT, path)
    d = os.path.dirname(full)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(full, "wb") as f:
        f.write(encode_png(width, height, rgba))
    print("wrote %s (%dx%d, %.1fKB)" % (path, width, height, os.path.getsize(full) / 1024.0))


# ---------------- 字形轮廓提取与展平 ----------------

def glyph_contours(char, size):
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    gname = cmap[ord(char)]
    glyphset = font.getGlyphSet()
    pen = RecordingPen()
    glyphset[gname].draw(pen)
    upm = font["head"].unitsPerEm
    # 字形框（含 bearing），垂直居中 + 水平居中，占画布 ~68%
    bounds = [1e9, 1e9, -1e9, -1e9]

    def track(pts):
        for x, y in pts:
            bounds[0] = min(bounds[0], x)
            bounds[1] = min(bounds[1], y)
            bounds[2] = max(bounds[2], x)
            bounds[3] = max(bounds[3], y)

    for op, args in pen.value:
        if op == "moveTo" or op == "lineTo":
            track(args)
        elif op == "qCurveTo":
            # 控制点（含 None 结尾）一并纳入包围盒，保证缩放后字形完整
            track([p for p in args if p is not None])
    if bounds[2] < bounds[0]:
        raise RuntimeError("empty glyph")
    gw = bounds[2] - bounds[0]
    gh = bounds[3] - bounds[1]
    scale = size * 0.68 / max(gw, gh)
    ox = (size - gw * scale) / 2 - bounds[0] * scale
    oy = (size - gh * scale) / 2 - bounds[1] * scale

    def tx(pt):
        return (pt[0] * scale + ox, size - (pt[1] * scale + oy))  # y 翻转到图像坐标

    contours = []
    cur = []

    def flush():
        if len(cur) >= 3:
            contours.append(cur[:])  # 拷贝：cur 会被清空复用
        del cur[:]

    for op, args in pen.value:
        if op == "moveTo":
            flush()
            cur.append(tx(args[0]))
        elif op == "lineTo":
            cur.append(tx(args[0]))
        elif op == "qCurveTo":
            # RecordingPen 约定：qCurveTo(*points)，points = 全部 off-curve 点 + 末尾 on-curve 点
            #（闭合式轮廓末尾为 None）。连续 off-curve 的中点是隐含 on-point。
            pts = [p for p in args]
            if pts[-1] is None:
                pts[-1] = cur[0] if cur else tx((0, 0))
            off_pts = pts[:-1]
            end = tx(pts[-1])
            start = cur[-1] if cur else tx(pts[0])
            # 隐含 on-point 序列
            on = [start]
            for i in range(len(off_pts) - 1):
                on.append(((off_pts[i][0] + off_pts[i + 1][0]) / 2.0,
                           (off_pts[i][1] + off_pts[i + 1][1]) / 2.0))
            on.append(end)
            for i in range(len(on) - 1):
                c = tx(off_pts[i])
                p0 = on[i]
                p2 = on[i + 1]
                for k in range(1, 13):
                    t = k / 12.0
                    mt = 1 - t
                    x = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p2[0]
                    y = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p2[1]
                    cur.append((x, y))
        elif op == "closePath":
            flush()
        elif op == "curveTo":
            # 本字体为 TTF，不应出现三次曲线；兜底直线
            cur.append(tx(args[-1]))
    flush()
    return contours


# ---------------- 扫描线填充（非零环绕） ----------------

def fill_polygon(size, contours, color, rgba, supersample=4):
    ss = supersample
    edges = []
    for c in contours:
        n = len(c)
        for i in range(n):
            x0, y0 = c[i]
            x1, y1 = c[(i + 1) % n]
            if y0 == y1:
                continue
            # 记录原始方向（图像坐标 y 向下）：y 增 = +1（非零环绕必需）
            d = 1 if y1 > y0 else -1
            if y0 > y1:
                x0, y0, x1, y1 = x1, y1, x0, y0
            edges.append((y0 * ss, y1 * ss, x0 * ss, x1 * ss, d))
    h = size * ss
    for yy in range(h):
        yc = yy + 0.5
        dirxs = []
        for (ye0, ye1, xe0, xe1, d) in edges:
            if ye0 <= yc < ye1:
                t = (yc - ye0) / (ye1 - ye0)
                x = xe0 + (xe1 - xe0) * t
                dirxs.append((x, d))
        if not dirxs:
            continue
        dirxs.sort()
        wind = 0
        startx = None
        spans = []
        for (x, d) in dirxs:
            prev_wind = wind
            wind += d
            if prev_wind == 0 and wind != 0:
                startx = x
            elif prev_wind != 0 and wind == 0 and startx is not None:
                spans.append((startx, x))
                startx = None
        if wind != 0 and startx is not None:
            spans.append((startx, size * ss))  # 兜底：环绕未闭合
        if not spans:
            continue
        for (a, b) in spans:
            ia = max(0, int(round(a)))
            ib = min(size * ss, int(round(b)))
            if ib <= ia:
                continue
            for xxx in range(ia, ib):
                rgba[(yy // ss) * size * 4 + (xxx // ss) * 4] = color[0]
                rgba[(yy // ss) * size * 4 + (xxx // ss) * 4 + 1] = color[1]
                rgba[(yy // ss) * size * 4 + (xxx // ss) * 4 + 2] = color[2]
                rgba[(yy // ss) * size * 4 + (xxx // ss) * 4 + 3] = 255


def alpha_blit(size, rgba, draw_fn):
    draw_fn(size, rgba)


def rounded_rect(size, rgba, x0, y0, x1, y1, r, color):
    ss = 4
    for yy in range(int(y0 * ss), int(y1 * ss) + 1):
        for xx in range(int(x0 * ss), int(x1 * ss) + 1):
            px, py = xx / ss, yy / ss
            if px >= size or py >= size or px < 0 or py < 0:
                continue
            dx = max(x0 + r - px, px - (x1 - r), 0)
            dy = max(y0 + r - py, py - (y1 - r), 0)
            inside = (x0 + r <= px <= x1 - r or y0 + r <= py <= y1 - r or dx * dx + dy * dy <= r * r)
            if not inside:
                continue
            xi, yi = int(px), int(py)
            i = yi * size * 4 + xi * 4
            rgba[i] = color[0]
            rgba[i + 1] = color[1]
            rgba[i + 2] = color[2]
            rgba[i + 3] = color[3]


def make_icon(size, glyph_size, with_store_border=False):
    rgba = bytearray(size * size * 4)  # 透明底
    # 底：圆角黑漆方
    rounded_rect(size, rgba, 0, 0, size, size, size * 0.22, LACQUER)
    # 朱砂印章
    m = size * 0.10
    rounded_rect(size, rgba, m, m, size - m, size - m, size * 0.10, SEAL_RED)
    # 内圈暗红渐变感（画一圈暗红描边）
    m2 = size * 0.115
    rounded_rect(size, rgba, m2, m2, size - m2, size - m2, size * 0.085, SEAL_RED_DARK)
    m3 = size * 0.13
    rounded_rect(size, rgba, m3, m3, size - m3, size - m3, size * 0.075, SEAL_RED)
    # 金色内框
    m4 = size * 0.155
    rounded_rect(size, rgba, m4, m4, size - m4, size - m4, size * 0.05, GOLD)
    m5 = size * 0.17
    rounded_rect(size, rgba, m5, m5, size - m5, size - m5, size * 0.04, SEAL_RED)
    # 「唐」字（纸色）
    contours = glyph_contours(CHAR, size)
    fill_polygon(size, contours, PAPER, rgba)
    return rgba


def make_foreground(size):
    """自适应图标前景 432px：内容缩进到中央 66% 安全区。"""
    inner = int(size * 0.66)
    off = (size - inner) // 2
    tile = make_icon(inner, inner)
    rgba = bytearray(size * size * 4)  # 透明底
    for y in range(inner):
        for x in range(inner):
            si = (y * inner + x) * 4
            di = ((y + off) * size + (x + off)) * 4
            rgba[di] = tile[si]
            rgba[di + 1] = tile[si + 1]
            rgba[di + 2] = tile[si + 2]
            rgba[di + 3] = tile[si + 3]
    return rgba


def make_splash(w, h):
    rgba = bytearray(w * h * 4)
    for i in range(w * h):
        rgba[i * 4] = LACQUER[0]
        rgba[i * 4 + 1] = LACQUER[1]
        rgba[i * 4 + 2] = LACQUER[2]
        rgba[i * 4 + 3] = 255
    # 中央印章
    s = int(h * 0.62)
    tile = make_icon(s, s)
    ox, oy = (w - s) // 2, int(h * 0.06)
    for y in range(s):
        for x in range(s):
            si = (y * s + x) * 4
            if tile[si + 3] == 0:
                continue
            di = ((y + oy) * w + (x + ox)) * 4
            a = tile[si + 3] / 255.0
            for k in range(3):
                rgba[di + k] = int(rgba[di + k] * (1 - a) + tile[si + k] * a)
    # 标题「隋唐风云」四字
    csize = int(h * 0.26)
    for i, ch in enumerate([u"隋", u"唐", u"风", u"云"]):
        cont = glyph_contours(ch, csize)
        buf = bytearray(csize * csize * 4)  # 透明底
        fill_polygon(csize, cont, PAPER, buf)
        gx = (w - csize * 4) // 2 + i * csize
        gy = h - csize - int(h * 0.06)
        if gx + csize > w or gy + csize > h:
            raise RuntimeError("splash glyph out of range: %s" % ch)
        for y in range(csize):
            for x in range(csize):
                si = (y * csize + x) * 4
                if buf[si + 3] == 0:
                    continue
                di = ((y + gy) * w + (x + gx)) * 4
                for k in range(3):
                    rgba[di + k] = buf[si + k]
    return rgba


def main():
    # 启动器图标：替换仓库内 mipmap（构建即生效，可复现）
    for d, px in [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]:
        save("native/engine/android/res/mipmap-%s/ic_launcher.png" % d, px, px, make_icon(px, px))
    # 自适应图标（API 26+）：前景 + 颜色背景
    save("native/engine/android/res/drawable-nodpi/ic_launcher_foreground.png", 432, 432, make_foreground(432))
    os.makedirs(os.path.join(ROOT, "native/engine/android/res/mipmap-anydpi-v26"), exist_ok=True)
    with open(os.path.join(ROOT, "native/engine/android/res/mipmap-anydpi-v26/ic_launcher.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background"/>\n'
                '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
                '</adaptive-icon>\n')
    with open(os.path.join(ROOT, "native/engine/android/res/values/ic_launcher_background.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<resources>\n    <color name="ic_launcher_background">#171512</color>\n</resources>\n')
    print("wrote adaptive-icon xml")
    # 商店 512 图标
    save("build-assets/icon/icon-512.png", 512, 512, make_icon(512, 512))
    # 启动图
    save("build-assets/icon/splash-844x390.png", 844, 390, make_splash(844, 390))
    # app_name
    with open(os.path.join(ROOT, "native/engine/android/res/values/strings.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<resources>\n    <string name="app_name">隋唐风云</string>\n</resources>\n')
    print("wrote strings.xml (app_name=隋唐风云)")


if __name__ == "__main__":
    main()
