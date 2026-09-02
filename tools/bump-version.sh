#!/bin/sh
# 版本号自增：native/engine/android/app/build.gradle 是 versionCode/versionName 的唯一来源。
# 用法：
#   sh tools/bump-version.sh            # versionCode +1, versionName 末位 +1
#   sh tools/bump-version.sh 1.2.0     # versionCode +1, versionName 指定值
set -e

GRADLE_FILE="$(dirname "$0")/../native/engine/android/app/build.gradle"
[ -f "$GRADLE_FILE" ] || { echo "未找到 $GRADLE_FILE" >&2; exit 1; }

CUR_CODE=$(sed -n 's/.*versionCode \([0-9][0-9]*\).*/\1/p' "$GRADLE_FILE" | head -1)
CUR_NAME=$(sed -n 's/.*versionName "\([^"]*\)".*/\1/p' "$GRADLE_FILE" | head -1)
[ -n "$CUR_CODE" ] || { echo "未能解析 versionCode" >&2; exit 1; }

NEW_CODE=$((CUR_CODE + 1))
if [ -n "$1" ]; then
  NEW_NAME="$1"
else
  MAJOR=$(echo "$CUR_NAME" | cut -d. -f1)
  MINOR=$(echo "$CUR_NAME" | cut -d. -f2)
  PATCH=$(echo "$CUR_NAME" | cut -d. -f3)
  [ -n "$PATCH" ] || PATCH=0
  NEW_NAME="${MAJOR}.${MINOR}.$((PATCH + 1))"
fi

sed -i.bak "s/versionCode $CUR_CODE/versionCode $NEW_CODE/; s/versionName \"$CUR_NAME\"/versionName \"$NEW_NAME\"/" "$GRADLE_FILE"
rm -f "$GRADLE_FILE.bak"
echo "版本已更新：$CUR_CODE ($CUR_NAME) → $NEW_CODE ($NEW_NAME)"
echo "提交提示：git add $GRADLE_FILE && git commit -m 'chore: bump version $NEW_NAME'"
