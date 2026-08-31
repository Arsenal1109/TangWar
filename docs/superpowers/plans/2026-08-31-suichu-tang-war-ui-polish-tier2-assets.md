# UI 质感第二层（资产升级）实现记录

> **状态：✅ 代码与资产已落地**（类型检查与单测通过；编辑器内视觉复核清单见文末）。
>
> 承接第一层（`2026-08-31-suichu-tang-war-ui-polish-tier1.md`）。第二层引入两张真实资产：**霞鹜文楷子集字体** + **三套程序化九宫格皮肤贴图**，替换系统 serif 与部分 Graphics 平面填充。核心原则：**资源未就绪时自动降级到第一层的 Graphics 立体面板**，绝不让 UI 缺妆或报错。

**Goal:** 用真实字体与 9-slice 材质替换"扁平色块 + 系统字体"，把剩余的最粗的视觉短板补齐。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS；`tools/` 用 node + zlib 生成 PNG，fonttools 子集化字体；vitest 纯逻辑单测）。

---

## 资产

### 1. 字体：霞鹜文楷 Medium 子集

- 源：`LXGW WenKai Medium`（SIL OFL 1.1，[lxgw/LxgwWenKai](https://github.com/lxgw/LxgwWenKai) v1.522）。
- 子集化：`tools/subset-font.sh`（先 `extract-charset.mjs` 提取仓库字符集 + 常用军政缓冲字共 1636 字符，再 `pyftsubset`，保留 name/layout/GSUB/GPOS，去 DSIG）。
- 结果：**676KB**（原 25.4MB），1813 字形，cmap 覆盖校验 OK。
- 产出：`assets/resources/fonts/lxgw-wenkai.ttf`。
- 许可：SIL OFL 1.1（开放，可商用嵌入/再分发）。

### 2. 九宫格皮肤贴图（程序化生成）

`tools/gen-panels.mjs`（纯 Node，无外部依赖，固定随机种子可复现）：自实现 PNG 编码器（zlib + CRC32）+ 确定性 fbm 值噪声，绘制黑漆军帐风格面板。

| 纹理 | 尺寸 | 边框 | 用途 |
|---|---|---|---|
| `panel-lacquer` | 160×160 | 20 | 军议栏、系统页、时间线、对话/战报/开场/引导大卡 |
| `card-lacquer` | 112×112 | 14 | 城池详情卡、路线提示、战报入口、地图工具栏等中卡 |
| `button-gold` | 72×72 | 10 | 全局按钮（`button()`） |

均：暖褐径向基色 + 纵向木纹 fbm + 细颗粒 + 顶部光泽带 + 金/铜双段边框 + 四角 45° 角花。每张经 PNG 回读 CRC 与像素逐字节校验，合计约 39.5KB。

## 代码改动

`assets/scripts/ui/WarCouncilScreen.ts`

- **字体接线**：`label()` 注册所有 Label 到 `labelRegistry`，字体加载后 `useSystemFont=false; font=bodyFont` 应用到已建 Label；未来新 Label 直接走 `bodyFont`。`loadBodyFont()` 用双路径加载（`fonts/lxgw-wenkai` 裸路径 → `/font` 子资源）兼顾导入差异。
- **皮肤面板** `skinnedPanel()`：
  - 容器（wrapper）承载交互/尺寸/动效；子节点 `_Shadow`（软阴影）+ `_Skin`（9-slice 贴图）。
  - 贴图**已加载** → 立即 `applySkin`（Graphics 换 Sprite，`SizeMode.CUSTOM` + `Type.SLICED` + 四边 border，`packable=false`）；**未加载** → 入 `pendingSkins`，加载完成后逐个升级。
  - 尺寸过小（小于边框×2+8）走回退 `panel()`，避免 9-slice 退化。
  - `clearChildren()` 以 `_Skin`/`_Shadow` 命名豁免皮肤子节点，`renderPageAgain`/`refreshTimeline` 改用它，清除内容时保留底图。
  - `refreshTimeline` 的进度轨道 `setSiblingIndex` 改为置于皮肤节点之上。
- **绘制几何复用**：`drawPanelBg` 的阴影部分抽成 `drawShadow()`，供 Graphics 面板与皮肤阴影节点共用。

## 验证

- 类型检查（tsc + 最小 `cc` 桩）：改动前后错误清单一致（既有 5 项），无新增。
- 单测：17 文件 72 用例全部通过。
- PNG 自校验 & 字体 cmap 覆盖均 OK。

## 编辑器视觉复核清单（待做）

1. 打开项目让 Cocos 自动导入 `fonts/` 与 `panels/`（若导入器提示 uuid 变动，接受即可；首次导入会生成 `.meta`）。
2. 主战页：军议栏、时间线、系统页、地图工具栏、城池卡、战报入口、按钮出现黑漆木纹 + 金框，无拉伸糊边（9-slice 生效）。
3. 全局文字切为霞鹜文楷，标题/正文字形统一、无豆腐块、无跑位。
4. 对话/战报/开场/引导层卡片带材质底；反复打开页面后无皮肤丢失、无进度轨道遮挡。
5. 按钮按下缩放回弹正常，未出现贴图下 Graphics 残留（该换位时应已切换为 Sprite）。console errors: 0。

## 后续

- 字体可再补 **思源宋体 Bold**（标题/数字）形成双字族（`label()` 可按 `bold` 位选字体，零调用点改动）。
- 图标族（粮/金/兵/民心、势力旗、将领小头像）仍为第二层的可选收尾；可在 `gen-panels.mjs` 基础上延伸或直接用生成的字形做印章徽记。
- 氛围第三层（传令烛光、地图云影、军议卡扫光、Toast 分级）。
