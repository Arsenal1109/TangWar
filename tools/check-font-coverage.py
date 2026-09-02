#!/usr/bin/env python3
# 字体覆盖校验：仓库字符集（UI 文案/数据表/文档词表）中的字符
# 必须在已提交的字体子集（assets/resources/fonts/lxgw-wenkai.ttf）里有字形。
# 防止「改了文案忘记重跑 subset-font.sh」导致运行时出现豆腐块。
# 语义：若提供 --source（完整源字体，CI 从 GitHub Release 下载），则只校验
# 源字体本身有的字符（emoji 等源字体不提供的不算缺失）；否则全量校验。
# 依赖：node tools/extract-charset.mjs、fontTools（pip3 install fonttools）
import argparse
import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARSET = os.path.join(ROOT, "temp", "font-subset", "charset.txt")
SUBSET = os.path.join(ROOT, "assets", "resources", "fonts", "lxgw-wenkai.ttf")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=None, help="完整源字体路径；提供后仅校验源字体覆盖的字符")
    parser.add_argument("--charset", default=CHARSET)
    args = parser.parse_args()

    if not os.path.exists(args.charset):
        print("缺少字符集文件 %s（先运行 node tools/extract-charset.mjs）" % args.charset)
        return 2
    if not os.path.exists(SUBSET):
        print("缺少字体子集 %s" % SUBSET)
        return 2
    with open(args.charset, encoding="utf-8") as f:
        chars = set(f.read())
    subset = TTFont(SUBSET)
    cmap = subset.getBestCmap()
    if args.source:
        if not os.path.exists(args.source):
            print("缺少源字体 %s" % args.source)
            return 2
        source_cmap = TTFont(args.source).getBestCmap()
        chars = {ch for ch in chars if ord(ch) in source_cmap}
    missing = sorted(ch for ch in chars if ord(ch) not in cmap)
    if missing:
        print("字体子集缺 %d 个字形：%s" % (len(missing), "".join(missing[:60])))
        print("修复：重跑 bash tools/subset-font.sh（源字体见脚本头部说明）")
        return 1
    print("字体覆盖 OK：%d 个字符全部有字形%s" % (len(chars), "（按源字体过滤）" if args.source else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
