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
.\build-apk.ps1        # 已签名 APK
.\build-apk.ps1 -AAB   # 已签名 .aab（Google Play 用）
\`\`\`

脚本固定使用 \`D:\Gradle\gradle-8.11.1\bin\gradle.bat\`，不会调用会联网下载或选错版本的 Gradle Wrapper。
签名配置：\`sh tools/gen-keystore.sh\` 生成 keystore，再建 \`signing.properties\`（见 \`signing.properties.example\`）或设 \`TANGWAR_RELEASE_*\` 环境变量。
版本号：\`sh tools/bump-version.sh\`。
完整上架流程见 \`docs/RELEASE.md\`。

## 项目结构

- `assets/scripts/data/`：势力、城池（含邻接图）、将领数据表（引擎无关）
- `assets/scripts/core/`：回合、资源结算、事件总线、军议结算（引擎无关）
- `assets/scripts/core/CommandSystem.ts`：军议三令真实结算引擎（战斗/夺城/伏兵/胜算）
- `assets/scripts/core/AI.ts`：群雄决策（邻接约束远征军攻城 / 边境养锐）
- `assets/scripts/core/TurnFlow.ts`：回合装配（行军→AI→资源→事件→急报→胜负）
- `assets/resources/redesign/`：新版沙盘战图与人物立绘资源
- `assets/resources/redesign/panels/`：九宫格皮肤贴图（panel/card/button 三套，程序化生成）
- `assets/resources/redesign/effects/`：氛围特效贴图（暖光/云影/扫光条，程序化生成）
- `assets/resources/fonts/`：霞鹜文楷子集字体（替换系统 serif）
- `assets/resources/sounds/`：军旅音效八件套（`tools/gen-sfx.py` 程序化生成，可直接同名替换正式素材）
- `assets/scripts/map/`：传统舆图渲染与交互（保留模块）
- `assets/scripts/ui/WarCouncilScreen.ts`：军议、路线预演、传令、战报与动效主循环
- `tools/`：UI 资产生成脚本（`gen-panels.mjs`、`gen-effects.mjs`、`gen-sfx.py`、`extract-charset.mjs`、`subset-font.sh`、`typecheck.sh`）
- `tests/balance-sim.ts`：蒙特卡洛平衡模拟（`npx vite-node balance-sim.ts`，回放整局统计结局分布）
- `docs/superpowers/`：设计文档与实现计划

## 里程碑

- 当前：横屏全域沙盘、三项军议（真实战斗结算：兵力×统率×克制×城防，可胜可败可夺城）、路线预演、城池/部队/计策/外交/情报完整页面、传令结算、动态战报与自动存档（v2：外交/将领忠诚/行军令全持久化）、全局视觉质感层、霞鹜文楷正式字体、氛围微动效、模态遮罩与刘海屏安全区避让
- 系统全通：五大系统全部接入 UI——募兵六兵种、行军/调防/攻城（多回合到达结算）、五项外交行动（进贡/结盟/停战/和亲/威慑）、三项计策（谣言/离间/收买）+伏兵设险、城池设施建设（农田/商市/兵营/仓廪）、19 名群雄敌将与忠诚体系、历史事件链（瓦岗鼎盛/江都宫变/刘武周南下/虎牢关大捷…）、领土急报与结局结算画面
- 平衡与音频：AI 远征军真实攻城（不再白拿城池）、军旅音效八件套接线、200 局蒙特卡洛校准（夺城/失城/结局分布）、结局四档全部可达（一统/贞观/偏安/覆亡）
- 玩法深化（M3）：在野豪杰求贤（魏征/杜如晦/侯君集/苏定方，图鉴页延请）、年末忠诚结算（敌将离心弃暗投明/唐将怀怨叛逃，与离间收买成谍报闭环）、灾异丰稔随机事件（蝗灾/时疫/商旅/丰收/盗匪/名马，强度随难度伸缩）、盟约实value（岁贡/盟邦不侵/不入讨唐合纵）、冬季行军迟缓
- 玩法深化（M4）：武将特技六技（军神战力+8%/天策统率+5/王佐商税+20%/谋主计策+谋略/铁壁城防+2，李靖李世民房玄龄刘文静魏征徐世勣王世充）、功业系统十项成就（图鉴页双页签，解锁播报）、借兵勤王（向盟邦借府兵四百，八回合冷却）
- 后续：正式立绘扩充 → 联姻深化 → 成就扩展
