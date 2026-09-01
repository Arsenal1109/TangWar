# 隋唐风云

隋末唐初（617—626）策略手游（单机）。玩家扮演李唐（李渊 → 李世民），在群雄逐鹿中经营内政、运筹帷幄、统一天下。

- 引擎：Cocos Creator 3.8（TypeScript）
- 目标平台：Android 原生 APP（横屏，双向自动旋转）
- 美术：黑漆军帐界面 + 写实沙盘战图 + 东方历史人物立绘

## 运行

1. 用 Cocos Creator 3.8 打开本目录
2. 打开 `assets/scenes/main.scene`，点击预览

> 首次打开项目时，Cocos 编辑器会自动生成 `temp/`、`library/` 与各资源的 `.meta` 文件。

## 单测（纯逻辑层，不依赖 Cocos）

```bash
cd tests
npm install
npm test
```

单测覆盖：数据表完整性、回合推进、资源结算（粮草/黄金/民心/逃兵）。

## Android Release 打包

项目根目录执行：

\`\`\`powershell
.\build-apk.ps1
\`\`\`

脚本固定使用 \`D:\Gradle\gradle-8.11.1\bin\gradle.bat\`，不会调用会联网下载或选错版本的 Gradle Wrapper。

## 项目结构

- `assets/scripts/data/`：势力、城池、将领数据表（引擎无关）
- `assets/scripts/core/`：回合、资源结算、事件总线（引擎无关）
- `assets/resources/redesign/`：新版沙盘战图与人物立绘资源
- `assets/resources/redesign/panels/`：九宫格皮肤贴图（panel/card/button 三套，程序化生成）
- `assets/resources/redesign/effects/`：氛围特效贴图（暖光/云影/扫光条，程序化生成）
- `assets/resources/fonts/`：霞鹜文楷子集字体（替换系统 serif）
- `assets/scripts/map/`：传统舆图渲染与交互（保留模块）
- `assets/scripts/ui/WarCouncilScreen.ts`：军议、路线预演、传令、战报与动效主循环
- `tools/`：UI 资产生成脚本（`gen-panels.mjs`、`gen-effects.mjs`、`extract-charset.mjs`、`subset-font.sh`、`typecheck.sh`）
- `docs/superpowers/`：设计文档与实现计划

## 里程碑

- 当前：横屏全域沙盘、三项军议、路线预演、城池/部队/计策/外交/情报完整页面、传令结算、动态战报与自动存档、全局视觉质感层（倒角描边/软阴影面板、按压反馈、级联入场、资源数字滚动）、霞鹜文楷正式字体与九宫格面板/按钮皮肤、氛围微动效（传令烛光呼吸、地图云影、军议扫光、Toast 分级）、模态遮罩与刘海屏安全区避让
- 后续：扩充真实行军/战斗表现 → 历史事件分支 → 音频与字体资源 → 商店签名发布
