# M7 军帐双屏重构实现记录（横屏主战页）

> **状态：✅ 已实施（回顾性记录，2026-08-31 依实际代码与 QA 补写）** — 对应提交 `b672a56`（feat: complete TangWar strategy game project）；设计 QA 结论见根目录 `design-qa.md`。

**Goal:** 把 v1 竖屏「顶部栏 + 底部导航 + 底部弹层」的分散界面，重构为横屏「黑漆军帐双屏」主战页：左侧写实沙盘战图、右侧军议栏、底部全宽作战进程，把回合决策收束为一个完整决策流——选择军议 → 看路线 / 时间线 / 收益 → 长按传令。

**Architecture:** 单首屏组件 `ui/WarCouncilScreen.ts` 运行时程序化搭建全部界面：Graphics 自绘骨架 + `assets/resources/redesign/` 位图叠加（战图、图标、立绘）；经既有 `EventBus` 调用纯逻辑层（募兵 / 施政 / 外交 / 谋略 / 回合推进），自己不实现结算规则。`Bootstrap` 只负责画布 / 相机 / 纸张底幕与首屏装配。设计分辨率 844 × 390（横屏，双向自动旋转），全局系统 serif 字体以兼顾 Android 兼容性。

**Tech Stack:** 同前（Cocos Creator 3.8 + TypeScript，node + vitest 纯逻辑单测）。

---

## 文件结构（M7）

```
assets/scripts/
├── Bootstrap.ts               # 修改：buildUi 仅装配 WarCouncilScreen + SoundManager；旧面板停用
└── ui/
    └── WarCouncilScreen.ts    # 新增：军帐双屏主战页（沙盘战图、军议、作战进程、七页面、设置）
assets/resources/redesign/     # 新增：war-map / war-map-landscape 战图、icons 工具图标、人物立绘
art-source/generated/          # 新增：立绘源图归档（liu-wenjing-source 等）
design-qa.md                   # 新增：横屏军帐双屏设计 QA 记录（对照基准、四轮迭代、最终结论）
```

## Task 1: 军帐双屏主战页骨架

- [x] 650px 主战图 + 194px 军议栏双屏结构，底部全宽作战进程，右下长按传令区
- [x] 军议三项：防御（固守待援·太原·1 回合·86%·粮 -300）/ 突袭（袭击敌军·井陉关·2 回合·68%·粮 -600）/ 安抚（招抚降附·河东·1 回合·74%·粮 -400）
- [x] 选中军议后路线、时间线与收益同步刷新；军议标题可进「计策」页
- [x] 长按传令：按住进度 + 呼吸动效 → 推进回合，资源 / 战报 / 存档随之更新，长按完成触发震动

## Task 2: 沙盘战图与地图工具

- [x] 写实沙盘战图（`redesign/war-map-landscape`）打底，领土改为半透明不规则多边形
- [x] 地图工具四项：地形 / 势力 / 城池 / 标记，图标取自基准附图位图
- [x] 太原选择环、军令路线、领土警示、行军节点等动效反馈
- [x] 城池卡（左下）：点击进入城池详情，「调兵」进部队页、「城内」进城池页

## Task 3: 七页面体系

- [x] 页面键：`world / cities / army / strategy / diplomacy / intel / settings`
- [x] 世界（地形）、城池（城况摘要 + 政令）、部队（主将 / 兵力 / 募兵）、计策（军议详析 + 谋略）、外交（势力关系 + 进贡）、情报（战报 + 天下大事）、设置
- [x] 各页面返回路径与操作闭环（QA 第 4 轮修复城池页重叠后复核通过）
- [x] 设置项：军帐音乐 / 传令震动 / 快速战报；手动存档入口（`save-requested`）

## Task 4: Bootstrap 收束

- [x] `buildUi` 仅装配 `WarCouncilScreen`（经 `init(turns, bus, cityStates)` 注入运行态）与 `SoundManager`
- [x] `turn-advanced` 回调同步运行态 → `runWorldTurn` 结算 → 天下大事推送 → 自动存档
- [x] v1 组件（`TopBar` / `BottomNav` / `CitySheet` / 五功能面板、`map/` 渲染）不再装配，代码暂留

## Task 5: 设计 QA（design-qa.md）

- [x] 以附图为唯一视觉基准，四轮迭代：初始横屏版 → 结构对齐 → 资产与质感 → 页面完整性
- [x] 最终结论：无未解决 P0–P2；仅 P3 两项（源图冬季数值 vs 实现存档秋季数值的沙盘差异；系统 serif 字体与刻本字体的轻微字面差异）
- [x] 浏览器复核主战页与城池页，最终 console errors：0

## 验证

- 纯逻辑单测 17 个文件 72 用例全部通过（`cd tests && npm test`）
- 设计 QA final passed（详见 `design-qa.md`，含逐轮截图对照与修复记录）

## 自审 / 遗留

- **已清理**：v1 组件（`TopBar` / `BottomNav` / `CitySheet` / 五功能面板及 `NextTurnButton` / `PanelChrome` / `InkTheme`）与 `map/`（`MapRenderer` / `MapCamera`）文件已整体移除；`Bootstrap` 的死 import、`GameEvents` 残留事件声明（`panel-nav` / `panel-close`）与未调用的 `buildBackdrop` / `buildMapChrome` 一并删除；清理后 17 文件 72 用例全部通过
- **字体**：系统 serif 族为兼容性取舍（QA P3），后续如需刻本字体气质需自带字库
- **战图差异**：源图为冬季数值与更写实地貌，实现读取当前存档数值并使用可交互沙盘，不做逐像素复制（QA P3）
