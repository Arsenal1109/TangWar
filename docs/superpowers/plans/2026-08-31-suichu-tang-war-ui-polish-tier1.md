# UI 质感第一层（零资产全局升级）实现记录

> **状态：✅ 代码已落地**（类型检查与单测通过；编辑器内视觉复核清单见文末，建议按 `design-qa.md` 的截图对照法逐页过一遍）。
>
> 背景讨论：用户希望页面更精细美化。方案分四层（1 零资产代码层 / 2 资产层 / 3 氛围动效层 / 4 QA 流程层），本文记录用户选择先落地的第一层。

**Goal:** 在不引入任何新美术资源的前提下，升级 `WarCouncilScreen` 的绘制与交互基建，让七个页面 + 主战页 + 对话/演出/开场/引导层同时获得立体感与触觉反馈。

**Architecture:** 全部 UI 本就流经 `rect / label / button / image` 四个 helper，因此新增 `panel()` 作为卡片级表面的统一入口（`rect()` 退化为纯图元：遮罩、分隔线、进度填充、路线节点）。所有立体效果在**单个 Graphics 内按绘制顺序叠加**，draw call 数与原先持平。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS；vitest 纯逻辑单测不涉及 UI）。

---

## 文件结构

```
assets/scripts/ui/WarCouncilScreen.ts   # 修改：+196/-43
README.md                               # 里程碑行更新
```

## 改动点

### 1. 设计 token（`const T`）

圆角（flat/chip/control/card/panel）、倒角高光色、暗边色、光泽带色、两层阴影色、动效时长（fast 0.12 / mid 0.22 / slow 0.38）、缓动词汇（cubicOut / backOut / sineOut）、级联间隔 0.045s、按压缩放 0.94、入场位移 8px。新增视觉参数先登记进 T，不再散落魔法数。

### 2. `panel()` + `drawPanelBg()`：立体面板

单个 Graphics 内依次绘制：两层软阴影（外淡内浓，向下偏移）-> 填充 -> 顶部光泽带两条（模拟漆面受光，仅对 `h>=30 && w>=60 && alpha>=230` 的实底面板启用）-> 内亮描边 1px（倒角高光）-> 外描边（传了 stroke 用 1.5px 金属边框，否则 1px 暗边）。圆角经 `fillRound/strokeRound` 归一（radius>0 走 roundRect）。

`refreshNav()` 选中态重绘改走 `drawPanelBg`，保证描边/光泽不丢。

### 3. `pressable()`：按压反馈

TOUCH_START 缩至 0.94，TOUCH_END/TOUCH_CANCEL 以 backOut 回弹；`Tween.stopAllByTarget` + 失效守卫（页面重建会拆掉节点），并兜底恢复位置（与级联入场共用还原逻辑）。接入：`button()` 全部按钮、军议卡、导航项、城池标记、战报入口、城池/政令/将领/兵种/计策/势力/设置各行卡。传令印信保持原有呼吸 + 长按填充反馈，不叠加按压缩放。

### 4. `entrance()`：级联入场

仅 `openPage` 时生效（`animatingEntrance` 标记置位一轮）；卡片按索引 `delay(min(i,7)*0.045)` 依次上浮 8px + 淡入。操作后的局部刷新（施政/募兵/进贡后的 `renderPageAgain`）不重播级联，保持即时。

### 5. `refreshHeader()`：资源数字滚动

保存上次快照（粮/金/兵/民心），变化时以 sineOut 0.55s 从旧值滚到新值（tween + onUpdate）。首次渲染与无变化时直接落值。

### 6. 小字对比度

`C.muted` 由 (172,152,112) 提亮至 (188,170,132)，深底上 10-11px 小字可读性提升（约 6.4:1 -> 7.6:1）。

## 有意保留为 `rect()` 的图元

MapShade / DialogueShade / BattleShade / OpeningShade / GuideShade*（全屏遮罩）、BadgeBg（小徽章）、StepRule / HeaderRule / CommanderRule / ProgressLine（细线）、March 路线节点、HoldFill（长按进度填充）、BattleFlash（全屏闪白）、GuideFocus（透明聚焦框）。

## 验证

- 类型检查（tests 自带 tsc + `temp/ui-check/cc-stub.d.ts` 桩）：改动前后错误清单一致（既有 5 项：GameEvents 约束 x4、settings key symbol 转换 x1），无新增。
- 单测：17 文件 72 用例全部通过。
- draw call：面板仍为每节点一个 Graphics（阴影/光泽/描边在同一 Graphics 内按命令顺序叠加），与原先持平。

## 编辑器视觉复核清单（待做）

1. 主战页：顶栏/唐印/战报入口/太原卡/军议栏/传令印/导航有描边与阴影层次，光泽带不刺眼。
2. 任一系统页：打开时卡片级联上浮淡入；施政/募兵后刷新不再重播级联。
3. 所有按钮与卡片：按下缩小、松手回弹，无卡死缩放。
4. 长按传令结算后：顶栏资源数字滚动。
5. console errors: 0。

## 后续（第二/三层，需美术资源）

- 九宫格贴图（黑漆木纹/绢纸/鎏金/朱砂）替换关键面板的 Graphics 填充（`Sprite.Type.SLICED`）。
- 正式字体（霞鹜文楷正文 + 思源宋体标题，fontTools 子集化 2-4MB）替换系统 serif。
- 图标族补全（粮/金/兵/民心、势力旗、将领小头像、回纹角花）。
- 氛围微动效：传令烛光呼吸、地图云影漂移、军议卡扫光、Toast 分级。
