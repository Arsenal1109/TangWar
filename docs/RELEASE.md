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

## 2. 版本号

```sh
sh tools/bump-version.sh          # versionCode +1，versionName 末位 +1
sh tools/bump-version.sh 1.1.0    # 指定 versionName
```

每次提审都要：`versionCode` 严格递增（商店以此判断升级），`versionName` 是给用户看的显示版本。

## 3. 构建

```powershell
.\build-apk.ps1              # 已签名 APK（安装测试 / 国内商店多数要 APK）
.\build-apk.ps1 -AAB         # 已签名 .aab（Google Play 必须用 AAB）
```

未配置签名时脚本会明确警告并产出**未签名包**——只可自测，不可上架。

## 4. 上架材料清单

| 项目 | 要求 | 现状 |
|---|---|---|
| 应用图标 512×512 | PNG，无透明 | `assets/resources/redesign/icons/` 生成源可扩 |
| 至少 2 张手机截图 | 真机或模拟器截横屏 16:9 / 19.5:9 | 构建后截取 |
| 功能描述 | 简短+详细两版 | 参考 README「里程碑」改写 |
| 隐私政策 URL | 必须（商店合规） | 需准备静态页（离线游戏声明不收集数据即可） |
| 内容分级问卷 | 商店内填写 | 选「无不良内容」 |
| 目标受众 / 数据安全表 | Play Console 必填 | 离线单机：不收集任何数据 |
| 首次发布审核周期 | 新应用 1–7 天 | 预留时间 |

## 5. 发布前自测（最小回归）

1. 全新安装 → 首启出现难度选择 → 序章 → 教学 → 可下达军令
2. 打一仗（突袭马邑）、下一道行军令、做一次外交、放一个计策
3. 切后台再回来、锁屏解锁 → 游戏不崩溃、音效正常
4. 杀进程重启 → 存档恢复（年代/资源/版图一致）
5. 打到 626 年（或速改本机时间验证）→ 结局画面 → 重开新局正常

## 6. 版本标签

```sh
git tag -a v1.0.1 -m "release 1.0.1"
git push origin v1.0.1
```
