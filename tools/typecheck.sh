#!/usr/bin/env bash
# 无编辑器环境下的 UI 类型检查：用最小 'cc' 桩 + tests 自带 typescript。
# 项目存在若干既有错误（EventBus 泛型约束、settings key symbol 转换），
# 本脚本以「相对基线无新增错误」为通过标准：归一化后的错误集合与基线一致即 OK。
#
# 更新基线：candidate 修正后手动执行
#   tsc ... | 归一化（去 行:列 并 sort） > tools/typecheck-baseline.txt
# 用法：bash tools/typecheck.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TSC="tests/node_modules/.bin/tsc"
[ -x "$TSC" ] || { echo "缺少 tests/node_modules（先 cd tests && npm install）"; exit 1; }
FILES="temp/ui-check/cc-stub.d.ts assets/scripts/ui/WarCouncilScreen.ts assets/scripts/ui/SoundManager.ts assets/scripts/Bootstrap.ts"

mkdir -p temp/ui-check
cat > temp/ui-check/cc-stub.d.ts << 'EOF'
declare module 'cc' {
  export const _decorator: any; export type _decorator = any;
  export const Color: any; export type Color = any;
  export const Component: any; export type Component = any;
  export const Font: any; export type Font = any;
  export const Graphics: any; export type Graphics = any;
  export const HorizontalTextAlignment: any; export type HorizontalTextAlignment = any;
  export const Label: any; export type Label = any;
  export const Layers: any; export type Layers = any;
  export const Node: any; export type Node = any;
  export const resources: any; export type resources = any;
  export const Sprite: any; export type Sprite = any;
  export const SpriteFrame: any; export type SpriteFrame = any;
  export const sys: any; export type sys = any;
  export const Texture2D: any; export type Texture2D = any;
  export const Tween: any; export type Tween = any;
  export const tween: any; export type tween = any;
  export const UITransform: any; export type UITransform = any;
  export const UIOpacity: any; export type UIOpacity = any;
  export const Vec3: any; export type Vec3 = any;
  export const VerticalTextAlignment: any; export type VerticalTextAlignment = any;
  export const view: any; export type view = any;
  export const AudioClip: any; export type AudioClip = any;
  export const AudioSource: any; export type AudioSource = any;
  export const input: any; export type input = any;
  export const Input: any; export type Input = any;
  export const Camera: any; export type Camera = any;
  export const Canvas: any; export type Canvas = any;
  export const ResolutionPolicy: any; export type ResolutionPolicy = any;
  export const isValid: any;
  export const game: any; export type game = any;
}
EOF

# 归一化：去 (行:列)，只保留 文件:错误码 消息；排序去重。
# tsc 因存在既有错误返回非零，故末尾 || true，交给与基线比对来判断。
"$TSC" --noEmit --skipLibCheck --strict false --experimentalDecorators --target es2020 --module esnext --moduleResolution bundler $FILES 2>&1 \
  | sed -E 's/\([0-9]+,[0-9]+\)/(L,C)/' \
  | sort -u > temp/ui-check/typecheck-norm.txt || true

BASELINE="tools/typecheck-baseline.txt"
NEW=$(comm -23 temp/ui-check/typecheck-norm.txt "$BASELINE")
if [ -n "$NEW" ]; then
  echo "✗ 类型检查出现【相对基线新增错误】："
  echo "$NEW"
  exit 1
fi
echo "✓ typecheck: 错误 $(wc -l < temp/ui-check/typecheck-norm.txt) 条，与基线一致，无新增。"
