#!/usr/bin/env bash
# 字体子集化：仓库字符集 -> 霞鹜文楷 Medium 子集（assets/resources/fonts/lxgw-wenkai.ttf）。
#
# 依赖：node >= 20、python3 + fonttools（pip3 install --target temp/pylibs fonttools）
# 用法：bash tools/subset-font.sh [源TTF]   （默认 temp/LXGWWenKai-Medium.ttf）
#
# 源字体下载（网络受限时经镜像）：
#   curl -L -o temp/LXGWWenKai-Medium.ttf \
#     https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Medium.ttf
# 许可：SIL Open Font License 1.1（见 docs/superpowers/plans/*tier2-assets* 附录）。
set -euo pipefail

SRC="${1:-temp/LXGWWenKai-Medium.ttf}"
OUT="assets/resources/fonts/lxgw-wenkai.ttf"
PYLIBS="temp/pylibs"

[ -f "$SRC" ] || { echo "缺少源字体 $SRC（见脚本头部下载说明）"; exit 1; }
[ -d "$PYLIBS" ] || pip3 install --target "$PYLIBS" "fonttools"

node tools/extract-charset.mjs temp/font-subset/charset.txt

mkdir -p "$(dirname "$OUT")"
PYTHONPATH="$PYLIBS" python3 -m fontTools.subset "$SRC" \
  --text-file=temp/font-subset/charset.txt \
  --output-file="$OUT" \
  --name-IDs='*' --name-languages='*' \
  --layout-features='*' \
  --notdef-outline \
  --drop-tables+=DSIG

PYTHONPATH="$PYLIBS" python3 - "$OUT" << 'EOF'
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1], lazy=True)
cmap = font.getBestCmap()
text = open('temp/font-subset/charset.txt', encoding='utf8').read()

# 只要求游戏文本会渲染的区块：ASCII、通用标点、CJK 符号/汉字、全角形式。
# emoji（U+1F000+、U+2600-27BF）、零宽字符、控制符仅存在于设计文档，豁免。
def expect(cp):
    if 0x20 <= cp <= 0x7e:
        return True
    if cp in (0xb7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2025, 0x2026):
        return True
    if 0x3000 <= cp <= 0x303f:
        return True
    if 0x4e00 <= cp <= 0x9fff:
        return True
    if 0xff00 <= cp <= 0xffef:
        return True
    return False

missing = sorted({c for c in text if expect(ord(c)) and ord(c) not in cmap})
print(f"子集字形: {font['maxp'].numGlyphs}, cmap 覆盖: {len(cmap)}")
if missing:
    print('缺失字符:', ''.join(missing))
    sys.exit(1)
print('覆盖校验: OK')
EOF

ls -la "$OUT"
