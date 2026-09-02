#!/bin/sh
# 生成 Android 上架用的 release keystore（RSA 3072，有效期 30 年，Google Play 要求）。
# keystore 是应用的终身身份：丢失无法找回、无法给已上架应用换签名。
# 请务必：① 离线备份 keystore 与口令（密码管理器 + 异地冷备）；② 不要提交进 git。
#
# 用法：
#   sh tools/gen-keystore.sh                      # 交互输入口令
#   TANGWAR_STORE_PASS=xxx sh tools/gen-keystore.sh
#
# 依赖：JDK 8+ 的 keytool（Cocos Creator Android 构建依赖的 JDK 自带）。
set -e

STORE="${1:-release.keystore}"
ALIAS="${TANGWAR_ALIAS:-tangwar}"
VALIDITY_DAYS=10950  # 30 年

if command -v keytool >/dev/null 2>&1; then
  KEYTOOL=keytool
elif [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/keytool" ]; then
  KEYTOOL="$JAVA_HOME/bin/keytool"
else
  echo "错误：未找到 keytool。请安装 JDK 8+ 或设置 JAVA_HOME。" >&2
  exit 1
fi

if [ -f "$STORE" ]; then
  echo "错误：$STORE 已存在，避免覆盖。如需重建请先手工删除。" >&2
  exit 1
fi

if [ -z "${TANGWAR_STORE_PASS:-}" ]; then
  echo "将生成 $STORE（别名 $ALIAS）。请输入并确认 keystore 口令（不会回显）："
  read -r -p "口令: " PASS1 </dev/tty
  read -r -p "确认: " PASS2 </dev/tty
  if [ -z "$PASS1" ] || [ "$PASS1" != "$PASS2" ]; then
    echo "错误：口令为空或两次输入不一致。" >&2
    exit 1
  fi
else
  PASS1="$TANGWAR_STORE_PASS"
fi

"$KEYTOOL" -genkeypair -v \
  -keystore "$STORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 3072 \
  -validity $VALIDITY_DAYS \
  -storepass "$PASS1" \
  -keypass "$PASS1" \
  -dname "CN=TangWar, OU=Games, O=TangWar, L=Xi'an, ST=Shaanxi, C=CN"

chmod 600 "$STORE" 2>/dev/null || true

cat <<EOF

keystore 已生成：$STORE（别名 $ALIAS，有效期 $VALIDITY_DAYS 天）

下一步（本机一次性配置，二选一）：
1. 在项目根目录创建 signing.properties（已被 .gitignore 忽略）：
     RELEASE_STORE_FILE=$STORE
     RELEASE_STORE_PASSWORD=<你的口令>
     RELEASE_KEY_ALIAS=$ALIAS
     RELEASE_KEY_PASSWORD=<你的口令>
2. 或设置环境变量 TANGWAR_RELEASE_STORE_FILE / TANGWAR_RELEASE_STORE_PASSWORD /
   TANGWAR_RELEASE_KEY_ALIAS / TANGWAR_RELEASE_KEY_PASSWORD。

随后运行 .\\build-apk.ps1 即产出已签名 APK；加 -AAB 产出 Play 商店所需的 .aab。
再次提醒：keystore = 应用终身身份，务必离线备份！
EOF
