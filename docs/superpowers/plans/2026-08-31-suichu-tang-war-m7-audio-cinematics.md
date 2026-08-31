# M7 引导音频与战斗过场打磨实现记录

> **状态：✅ 已实施（回顾性记录，2026-08-31 依实际代码补写）** — 对应提交 `58eedac`（feat: polish onboarding audio and battle cinematics）。

**Goal:** 在军帐双屏基础上补齐「听感与演出」：开场背景对话与操作引导、军帐 BGM 与命名音效的完整音频系统（可开关、手势解锁、缺资源降级）、军令执行全屏战斗过场，并接入刘文静立绘。

**Architecture:** `ui/SoundManager.ts` 升级为双 `AudioSource`（BGM 循环 + SFX）：首次触摸手势解锁后播放 `audio/bgm-council`，设置页「军帐音乐」经新增事件 `audio-setting` 联动。`WarCouncilScreen` 新增引导层（背景对话、三步操作引导、重看入口）与过场层 `BattleCinematic`（Tween 补间演出，可跳过，受「快速战报」设置加速）。均为纯表现层，不改动回合与结算逻辑。

**Tech Stack:** 同前（Cocos Creator 3.8 + TypeScript，node + vitest 纯逻辑单测）。

---

## 文件结构（本次打磨）

```
assets/scripts/
├── Bootstrap.ts               # 修改：GameEvents 新增 'audio-setting': { music: boolean }
└── ui/
    ├── SoundManager.ts        # 重写：BGM + SFX 双 AudioSource、手势解锁、audio-setting 联动
    └── WarCouncilScreen.ts    # 修改：开场引导 + 战斗过场 BattleCinematic + 设置页开关
art-source/generated/
└── liu-wenjing-source.png     # 新增：刘文静立绘源图
assets/resources/
├── audio/                     # 新增：bgm-council.ogg（随 b672a56 入库）+ README
└── redesign/
    └── liu-wenjing-optimized.png  # 新增：刘文静立绘（优化位图）
```

## Task 1: SoundManager 完整化（占位 → 实装）

- [x] 双 `AudioSource`：BGM（loop，音量 0.32）+ SFX
- [x] `loadBgm()` 加载 `audio/bgm-council`，失败 `console.warn` 优雅降级
- [x] 首次 `TOUCH_START` / `MOUSE_DOWN` 手势解锁后 `tryStartBgm()`（移动端自动播放策略）
- [x] `audio-setting` 事件联动音乐开关（`GameEvents` 新增类型，Bootstrap 声明）
- [x] `SFX_MAP` 命名音效（`turn-advanced` → sounds/turn、`city-selected` → sounds/select），资源缺失降级为日志

## Task 2: 设置页与开场引导

- [x] 设置项三开关：军帐音乐（emit `audio-setting`）/ 传令震动 / 快速战报
- [x] 开场背景对话（可「跳过对话」）+ 三步操作引导：选择军议 → 看懂作战进程 → 长按传令，聚光遮罩分步高亮
- [x] 引导完成状态本地记忆 `tangwar:onboarding:v3`；设置页「重看」入口可重放背景、对话与操作说明

## Task 3: 战斗过场 BattleCinematic

- [x] 全屏过场层（28 层级，屏蔽穿透点击）：`redesign/war-map-landscape` 战图打底 + 暗幕 + 顶部「军令执行 · 〈军议标题〉〈目标〉」条与阶段提示
- [x] 行军演出：Graphics 贝塞尔行军路线（太原 → 目标），先锋图标沿路三段补间移动，敌阵图标呼吸脉动
- [x] 四阶段推进文案（防御：关闭城门 / 迁粮清野 / 巡营整军 / 防线结算；突袭：轻骑出营 / 穿越太行 / 突入敌阵 / 战果回报；安抚：使者出城 / 宣示军纪 / 乡勇归附 / 安抚结算），底部阶段条点亮
- [x] 交战瞬间：纸色闪光 + 舞台震屏 →「捷报 / 军情急报」结算卡（标题 + 正文 + 粮耗与回合提示 + 「收取战报」）
- [x] 「跳过演出」直达结算卡；「快速战报」设置将补间速度 ×0.58
- [x] `removeCinematic()` 清理：停止全部 Tween 并销毁过场层

## Task 4: 立绘与音频资源

- [x] 刘文静立绘：`art-source/generated/liu-wenjing-source.png` → `assets/resources/redesign/liu-wenjing-optimized.png`
- [x] `assets/resources/audio/bgm-council.ogg` 军帐 BGM（ogg 本体随 `b672a56` 入库，本次提交更新其 `.meta`）+ 音频目录 README

## 验证

- 纯逻辑单测 17 个文件 72 用例全部通过（`cd tests && npm test`）
- 预览：首次触摸后 BGM 开始播放；设置页音乐开关即时生效；过场可完整播放、可跳过、可加速

## 自审 / 遗留

- **SFX 资源未入库**：`resources/sounds/turn`、`resources/sounds/select` 尚无音频文件，播放时按设计降级为日志；后续补资源即自动生效
- 引导与过场为纯表现层，不改回合推进、战斗结算与存档结构
- 音频沿用 `EventBus` 事件驱动（`turn-advanced` / `city-selected` / `audio-setting`），与 v1 占位版事件约定兼容
