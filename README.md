# 隋唐风云

隋末唐初（617—626）策略手游（单机）。玩家扮演李唐（李渊 → 李世民），在群雄逐鹿中经营内政、运筹帷幄、统一天下。

- 引擎：Cocos Creator 3.8（TypeScript）
- 目标平台：Android 原生 APP（竖屏）
- 美术：水墨古风界面 + 实用舆图 + 东方写实古风人物立绘

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

## 项目结构

- `assets/scripts/data/`：势力、城池、将领数据表（引擎无关）
- `assets/scripts/core/`：回合、资源结算、事件总线（引擎无关）
- `assets/scripts/map/`：舆图渲染与交互（Graphics）
- `assets/scripts/ui/`：顶部栏、底部导航、城池卡片
- `docs/superpowers/`：设计文档与实现计划

## 里程碑

- M1 框架：工程、舆图、回合循环、点城池（当前）
- M2 内政 → M3 军事 → M4 将领/外交/谋略 → M5 AI 与事件 → M6 打磨
