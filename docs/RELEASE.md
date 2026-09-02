# 上架发布清单（Google Play / 国内商店）

本文档是从「能跑」到「能上架」的最后一公里。按顺序执行即可。

## 0. 前置条件

- Windows 构建机：Cocos Creator 3.8.8（`C:\ProgramData\cocos\editors\Creator\3.8.8\`）+ 固定 Gradle 8.11.1（`D:\Gradle\`）
- JDK 8+（Creator Android 构建已依赖；`keytool` 在其 `bin` 目录）
- Google Play 开发者账号（一次性 $25）或目标国内商店开发者账号

## 1. 生成签名（只做一次，终身一次）

```powershell
# Git Bash / WSL 下：
sh tools/gen-keystore.sh release.keystore
# 交互输入口令后得到 release.keystore（已在 .gitignore 中，不会入库）
```

**keystore 是应用的终身身份**：丢失无法找回，已上架应用无法换签名。
立即双备份：密码管理器存口令 + 离线介质（U盘）存 keystore 文件。

然后创建本机配置（二选一，均不入库）：

- 项目根目录 `signing.properties`（参考 `signing.properties.example`）
- 或环境变量 `TANGWAR_RELEASE_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD`

## 2. 包名与应用名（只定一次，上架后不可改）

- **包名（applicationId）**由 Creator 构建面板写入构建机本地 profiles（不入库）。
  上架前在构建面板设为 `com.tangwar.game`（或自有域名反写），**切勿使用默认 `com.cocos.game`**。
  `build-apk.ps1` 会在工程生成后自动校验，发现默认包名即中止。
- **应用名**已固定为「隋唐风云」（`native/engine/android/res/values/strings.xml`）。
- 图标/启动图由 `tools/gen-icon.py` 生成（印章「唐」真字形）：
  - 启动器图标已写入 `native/engine/android/res/mipmap-*`（仓库内，可复现）
  - 自适应图标（API 26+）：`res/mipmap-anydpi-v26/ic_launcher.xml` + `drawable-nodpi/ic_launcher_foreground.png`
  - 商店 512 图标与启动图：`build-assets/icon/icon-512.png`、`splash-844x390.png`
    （启动图需在 Creator 构建面板的自定义闪屏中选择 splash 文件）

## 3. 版本号

```sh
sh tools/bump-version.sh          # versionCode +1，versionName 末位 +1
sh tools/bump-version.sh 1.1.0    # 指定 versionName
```

每次提审都要：`versionCode` 严格递增（商店以此判断升级），`versionName` 是给用户看的显示版本。

## 4. 构建

```powershell
.\build-apk.ps1              # 已签名 APK（安装测试 / 国内商店多数要 APK）
.\build-apk.ps1 -AAB         # 已签名 .aab（Google Play 必须用 AAB）
```

未配置签名时脚本会明确警告并产出**未签名包**——只可自测，不可上架。

## 5. 上架材料清单

| 项目 | 要求 | 现状 |
|---|---|---|
| 应用图标 512×512 | PNG，无透明 | `assets/resources/redesign/icons/` 生成源可扩 |
| 至少 2 张手机截图 | 真机或模拟器截横屏 16:9 / 19.5:9 | 构建后截取 |
| 功能描述 | 简短+详细两版 | 参考 README「里程碑」改写 |
| 隐私政策 URL | 必须（商店合规） | 需准备静态页（离线游戏声明不收集数据即可） |
| 内容分级问卷 | 商店内填写 | 选「无不良内容」 |
| 目标受众 / 数据安全表 | Play Console 必填 | 离线单机：不收集任何数据 |
| 首次发布审核周期 | 新应用 1–7 天 | 预留时间 |

## 6. 发布前自测（最小回归）

1. 全新安装 → 首启出现难度选择 → 序章 → 教学 → 可下达军令
2. 打一仗（突袭马邑）、下一道行军令、做一次外交、放一个计策
3. 切后台再回来、锁屏解锁 → 游戏不崩溃、音效正常
4. 杀进程重启 → 存档恢复（年代/资源/版图一致）
5. 打到 626 年（或速改本机时间验证）→ 结局画面 → 重开新局正常

## 7. 版本标签

```sh
git tag -a v1.0.1 -m "release 1.0.1"
git push origin v1.0.1
```
