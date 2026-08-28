# M1 框架实现计划：工程脚手架 + 核心循环 + 舆图渲染

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 subagent-driven-development（推荐）或 executing-plans 逐任务执行本计划。步骤用复选框（`- [ ]`）跟踪进度。

**Goal:** 搭建可被 Cocos Creator 3.8 打开并运行的《隋唐风云》工程骨架：数据表、回合/资源纯逻辑（含 node 单测）、水墨舆图渲染、顶部栏、底部导航、点城池弹卡。

**Architecture:** 数据与核心逻辑（`assets/scripts/data`、`assets/scripts/core`）保持引擎无关（不 import `cc`），可用 node + vitest 单测；Cocos 组件（`map/`、`ui/`）只负责渲染与交互，调用纯逻辑层。场景采用「编辑器创建最小场景 + 单个 Bootstrap 组件运行时搭建」策略。

**Tech Stack:** Cocos Creator 3.8.x（TypeScript）、node（仅用于单测：vitest + typescript）、Graphics/Label/Button 组件、无外部美术资源。

**前置条件：**
- 本机已安装 Cocos Creator 3.8.x（本计划编辑器步骤基于 3.8 界面；3.7/3.9 界面基本一致）
- 本机有 node ≥ 18（用于运行纯逻辑单测）
- 仓库根目录 `d:\Github\TangWar`

---

## 文件结构总览

```
d:\Github\TangWar\
├── package.json                     # Cocos 项目清单
├── tsconfig.json                    # 继承编辑器生成的 temp/tsconfig.cocos.json
├── assets/
│   ├── scenes/
│   │   └── main.scene               # 编辑器创建（见 Task 4）
│   ├── scripts/
│   │   ├── Bootstrap.ts             # 启动装配
│   │   ├── data/
│   │   │   ├── Factions.ts          # 13 方群雄数据表（纯逻辑）
│   │   │   ├── Cities.ts            # 22 城池数据表（纯逻辑）
│   │   │   └── Generals.ts          # 李唐核心将领数据表（纯逻辑）
│   │   ├── core/
│   │   │   ├── Types.ts             # 共享类型（纯逻辑）
│   │   │   ├── TurnManager.ts       # 回合推进（纯逻辑）
│   │   │   ├── ResourceSystem.ts    # 回合结算（纯逻辑）
│   │   │   └── EventBus.ts          # 轻量事件总线（纯逻辑）
│   │   ├── map/
│   │   │   ├── MapRenderer.ts       # 舆图绘制（Graphics）
│   │   │   └── MapCamera.ts         # 拖动/缩放
│   │   └── ui/
│   │       ├── InkTheme.ts          # 水墨配色/字体常量
│   │       ├── TopBar.ts            # 顶部状态栏
│   │       ├── BottomNav.ts         # 底部导航 + 回合按钮
│   │       └── CitySheet.ts         # 城池底部卡片
├── tests/                           # 纯逻辑单测（独立于 Cocos）
│   ├── package.json
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── turn.test.ts
│   ├── resource.test.ts
│   └── data.test.ts
└── docs/superpowers/plans/          # 本计划
```

> 说明：`.meta` 文件由 Cocos 编辑器在首次打开项目时自动生成，无需手写。`temp/`、`library/`、`build/`、`profiles/` 均由编辑器生成，不入库。

---

## Task 1: 项目脚手架 + 单测环境

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tests/package.json`
- Create: `tests/vitest.config.ts`
- Create: `tests/tsconfig.json`
- Create: `tests/__mocks__/.gitkeep`（占位，保证目录存在）

- [ ] **Step 1: 创建 Cocos 项目清单 `package.json`**

```json
{
  "name": "suichu-tang-war",
  "uuid": "a1b2c3d4-0000-4000-8000-000000000001",
  "version": "1.0.0",
  "creator": { "version": "3.8.3" },
  "type": "3d",
  "description": "隋唐风云：隋末唐初策略手游（M1 框架）"
}
```

- [ ] **Step 2: 创建 `tsconfig.json`**

```json
{
  "extends": "./temp/tsconfig.cocos.json",
  "compilerOptions": {
    "strict": true,
    "experimentalDecorators": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: 创建单测环境 `tests/package.json`**

```json
{
  "name": "tangwar-tests",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: 创建 `tests/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        environment: 'node'
    }
});
```

- [ ] **Step 5: 创建 `tests/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["../assets/scripts/**/*.ts", "./**/*.ts"]
}
```

- [ ] **Step 6: 安装依赖并验证环境**

Run（在 `d:\Github\TangWar\tests` 目录）：
```bash
npm install
npx vitest run
```
Expected: `No test files found`（退出码 1 属正常，尚无测试），`node_modules` 生成成功即为环境就绪。

- [ ] **Step 7: 提交**

```bash
git add package.json tsconfig.json tests/
git commit -m "chore(m1): scaffold cocos project and test harness"
```

---

## Task 2: 共享类型与数据表（纯逻辑）

**Files:**
- Create: `assets/scripts/core/Types.ts`
- Create: `assets/scripts/data/Factions.ts`
- Create: `assets/scripts/data/Cities.ts`
- Create: `assets/scripts/data/Generals.ts`
- Test: `tests/data.test.ts`

- [ ] **Step 1: 写失败测试 `tests/data.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { FACTIONS, getFaction } from '../assets/scripts/data/Factions';
import { CITIES, getCity } from '../assets/scripts/data/Cities';
import { GENERALS } from '../assets/scripts/data/Generals';

describe('数据表完整性', () => {
    it('应有 13 方群雄且 id 唯一', () => {
        const ids = FACTIONS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(FACTIONS.length).toBe(13);
    });

    it('城池 id 唯一、势力引用有效、坐标在地图范围内', () => {
        const ids = CITIES.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of CITIES) {
            expect(() => getFaction(c.faction)).not.toThrow();
            expect(c.x).toBeGreaterThan(0);
            expect(c.x).toBeLessThan(640);
            expect(c.y).toBeGreaterThan(0);
            expect(c.y).toBeLessThan(560);
        }
    });

    it('应有 22 座城池', () => {
        expect(CITIES.length).toBe(22);
    });

    it('getCity 应能取回城池', () => {
        expect(getCity('taiyuan').name).toBe('太原');
        expect(getCity('taiyuan').faction).toBe('tang');
    });

    it('将领五维在 1..100，忠诚在 1..100', () => {
        for (const g of GENERALS) {
            expect(g.stats.command).toBeGreaterThanOrEqual(1);
            expect(g.stats.command).toBeLessThanOrEqual(100);
            expect(g.stats.politics).toBeGreaterThanOrEqual(1);
            expect(g.stats.politics).toBeLessThanOrEqual(100);
            expect(g.stats.strategy).toBeGreaterThanOrEqual(1);
            expect(g.stats.strategy).toBeLessThanOrEqual(100);
            expect(g.stats.valor).toBeGreaterThanOrEqual(1);
            expect(g.stats.valor).toBeLessThanOrEqual(100);
            expect(g.stats.prestige).toBeGreaterThanOrEqual(1);
            expect(g.stats.prestige).toBeLessThanOrEqual(100);
            expect(g.loyalty).toBeGreaterThanOrEqual(1);
            expect(g.loyalty).toBeLessThanOrEqual(100);
        }
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run data.test.ts`
Expected: FAIL — `Cannot find module '../assets/scripts/data/Factions'`

- [ ] **Step 3: 创建 `assets/scripts/core/Types.ts`**

```ts
// 共享基础类型（引擎无关，纯逻辑）
export type Season = '春' | '夏' | '秋' | '冬';

export type FactionPersonality = 'aggressive' | 'defensive' | 'scheming' | 'expansionist';

export interface FactionDef {
    id: string;
    name: string;        // 例：'大唐·李渊'
    color: string;       // 地图势力色，例：'#b03a2e'
    personality: FactionPersonality;
}

export interface CityDef {
    id: string;
    name: string;
    x: number;           // 舆图 viewBox 640x560 内坐标
    y: number;
    faction: string;     // FactionDef.id
    tier: number;        // 1=州府，0=郡县
}

export interface GeneralStats {
    command: number;     // 统军
    politics: number;    // 政务
    strategy: number;    // 谋略
    valor: number;       // 勇武
    prestige: number;    // 威望
}

export interface GeneralDef {
    id: string;
    name: string;
    title: string;       // 称谓，例：'秦王 · 天策上将'
    faction: string;
    stats: GeneralStats;
    loyalty: number;     // 忠诚 1..100
}
```

- [ ] **Step 4: 创建 `assets/scripts/data/Factions.ts`**

```ts
import type { FactionDef } from '../core/Types';

export const FACTIONS: FactionDef[] = [
    { id: 'tang', name: '大唐·李渊', color: '#b03a2e', personality: 'aggressive' },
    { id: 'sui', name: '隋·杨广', color: '#a8862e', personality: 'defensive' },
    { id: 'wa', name: '瓦岗·李密', color: '#2e7d32', personality: 'aggressive' },
    { id: 'zheng', name: '郑·王世充', color: '#d35400', personality: 'scheming' },
    { id: 'xia', name: '夏·窦建德', color: '#2f6f9f', personality: 'expansionist' },
    { id: 'chu', name: '楚·萧铣', color: '#7d4a9a', personality: 'defensive' },
    { id: 'qin', name: '秦·薛举', color: '#8a4a2a', personality: 'aggressive' },
    { id: 'liang', name: '凉·李轨', color: '#5b7a7a', personality: 'defensive' },
    { id: 'liu', name: '定杨·刘武周', color: '#3f4a5a', personality: 'aggressive' },
    { id: 'yan', name: '燕·高开道', color: '#1c8a7a', personality: 'defensive' },
    { id: 'wu', name: '吴·杜伏威', color: '#3a8f5f', personality: 'expansionist' },
    { id: 'shen', name: '梁·沈法兴', color: '#a05a30', personality: 'defensive' },
    { id: 'lin', name: '林·林士弘', color: '#6b7d2e', personality: 'defensive' }
];

export function getFaction(id: string): FactionDef {
    const f = FACTIONS.find((item) => item.id === id);
    if (!f) {
        throw new Error(`未知势力: ${id}`);
    }
    return f;
}
```

- [ ] **Step 5: 创建 `assets/scripts/data/Cities.ts`**

```ts
import type { CityDef } from '../core/Types';

export const CITIES: CityDef[] = [
    { id: 'taiyuan', name: '太原', x: 298, y: 215, faction: 'tang', tier: 1 },
    { id: 'jinyang', name: '晋阳', x: 318, y: 228, faction: 'tang', tier: 0 },
    { id: 'changan', name: '长安', x: 270, y: 275, faction: 'tang', tier: 1 },
    { id: 'jiangdu', name: '江都', x: 360, y: 318, faction: 'sui', tier: 1 },
    { id: 'luoyang', name: '洛阳', x: 300, y: 262, faction: 'zheng', tier: 1 },
    { id: 'xingyang', name: '荥阳', x: 322, y: 270, faction: 'wa', tier: 0 },
    { id: 'ye', name: '邺城', x: 318, y: 205, faction: 'xia', tier: 1 },
    { id: 'jiangling', name: '江陵', x: 292, y: 350, faction: 'chu', tier: 1 },
    { id: 'lanzhou', name: '陇西', x: 215, y: 260, faction: 'qin', tier: 0 },
    { id: 'wuwei', name: '凉州', x: 180, y: 230, faction: 'liang', tier: 0 },
    { id: 'shuofang', name: '朔方', x: 232, y: 200, faction: 'liu', tier: 0 },
    { id: 'mayi', name: '马邑', x: 272, y: 190, faction: 'liu', tier: 0 },
    { id: 'yuyang', name: '渔阳', x: 352, y: 158, faction: 'yan', tier: 0 },
    { id: 'lishan', name: '历阳', x: 358, y: 302, faction: 'wu', tier: 0 },
    { id: 'kuiji', name: '会稽', x: 402, y: 372, faction: 'shen', tier: 0 },
    { id: 'yuzhang', name: '豫章', x: 344, y: 392, faction: 'lin', tier: 0 },
    { id: 'chengdu', name: '成都', x: 255, y: 355, faction: 'chu', tier: 1 },
    { id: 'jiankang', name: '建康', x: 383, y: 312, faction: 'shen', tier: 1 },
    { id: 'youzhou', name: '幽州', x: 348, y: 138, faction: 'xia', tier: 1 },
    { id: 'pengcheng', name: '彭城', x: 358, y: 278, faction: 'wa', tier: 0 },
    { id: 'qingzhou', name: '青州', x: 392, y: 248, faction: 'xia', tier: 0 },
    { id: 'guangzhou', name: '广州', x: 358, y: 452, faction: 'chu', tier: 1 }
];

export function getCity(id: string): CityDef {
    const c = CITIES.find((item) => item.id === id);
    if (!c) {
        throw new Error(`未知城池: ${id}`);
    }
    return c;
}
```

- [ ] **Step 6: 创建 `assets/scripts/data/Generals.ts`**

```ts
import type { GeneralDef } from '../core/Types';

export const GENERALS: GeneralDef[] = [
    { id: 'lishimin', name: '李世民', title: '秦王 · 天策上将', faction: 'tang', loyalty: 100, stats: { command: 98, politics: 70, strategy: 92, valor: 90, prestige: 95 } },
    { id: 'liyuan', name: '李渊', title: '唐高祖', faction: 'tang', loyalty: 100, stats: { command: 60, politics: 92, strategy: 80, valor: 40, prestige: 90 } },
    { id: 'lijng', name: '李靖', title: '卫国公 · 名将', faction: 'tang', loyalty: 88, stats: { command: 96, politics: 66, strategy: 95, valor: 70, prestige: 85 } },
    { id: 'liuwenjing', name: '刘文静', title: '谋臣', faction: 'tang', loyalty: 80, stats: { command: 60, politics: 90, strategy: 93, valor: 45, prestige: 78 } },
    { id: 'peiji', name: '裴寂', title: '尚书右仆射', faction: 'tang', loyalty: 82, stats: { command: 55, politics: 92, strategy: 80, valor: 35, prestige: 75 } },
    { id: 'liyuanji', name: '李元吉', title: '齐王', faction: 'tang', loyalty: 70, stats: { command: 70, politics: 45, strategy: 48, valor: 82, prestige: 55 } },
    { id: 'zhangsunwuji', name: '长孙无忌', title: '赵国公 · 谋臣', faction: 'tang', loyalty: 90, stats: { command: 55, politics: 95, strategy: 88, valor: 40, prestige: 82 } },
    { id: 'zhangsunhuanghou', name: '长孙皇后', title: '文德皇后', faction: 'tang', loyalty: 100, stats: { command: 10, politics: 85, strategy: 70, valor: 10, prestige: 88 } },
    { id: 'fangxuanling', name: '房玄龄', title: '中书令 · 名相', faction: 'tang', loyalty: 90, stats: { command: 45, politics: 96, strategy: 90, valor: 30, prestige: 84 } },
    { id: 'chengyaojin', name: '程咬金', title: '卢国公 · 勇将', faction: 'tang', loyalty: 85, stats: { command: 78, politics: 30, strategy: 45, valor: 95, prestige: 80 } },
    { id: 'qinqiong', name: '秦琼', title: '胡国公 · 猛将', faction: 'tang', loyalty: 88, stats: { command: 82, politics: 25, strategy: 50, valor: 97, prestige: 82 } },
    { id: 'yuchigong', name: '尉迟恭', title: '鄂国公 · 虎将', faction: 'tang', loyalty: 88, stats: { command: 84, politics: 20, strategy: 42, valor: 98, prestige: 84 } }
];

export function getGeneral(id: string): GeneralDef {
    const g = GENERALS.find((item) => item.id === id);
    if (!g) {
        throw new Error(`未知将领: ${id}`);
    }
    return g;
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run data.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 8: 提交**

```bash
git add assets/scripts/core/Types.ts assets/scripts/data/
git commit -m "feat(m1): add faction/city/general data tables and validation tests"
```

---

## Task 3: 回合推进与资源结算（纯逻辑）

**Files:**
- Create: `assets/scripts/core/TurnManager.ts`
- Create: `assets/scripts/core/ResourceSystem.ts`
- Create: `assets/scripts/core/EventBus.ts`
- Test: `tests/turn.test.ts`
- Test: `tests/resource.test.ts`

- [ ] **Step 1: 写失败测试 `tests/turn.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { TurnManager } from '../assets/scripts/core/TurnManager';

describe('TurnManager 回合推进', () => {
    it('开局为大业十三年秋（第 0 回合）', () => {
        const t = new TurnManager(617, 2);
        expect(t.year).toBe(617);
        expect(t.getSeason()).toBe('秋');
        expect(t.getTurnNumber()).toBe(0);
    });

    it('推进一季：秋→冬，回合数 +1', () => {
        const t = new TurnManager(617, 2);
        t.advance();
        expect(t.getSeason()).toBe('冬');
        expect(t.getTurnNumber()).toBe(1);
    });

    it('冬后跨年：617 冬→618 春', () => {
        const t = new TurnManager(617, 3);
        t.advance();
        expect(t.year).toBe(618);
        expect(t.getSeason()).toBe('春');
        expect(t.getTurnNumber()).toBe(1);
    });

    it('年代名称：617=大业十三年，618=大业十四年·武德元年', () => {
        expect(TurnManager.eraName(617)).toBe('大业十三年');
        expect(TurnManager.eraName(618)).toBe('大业十四年·武德元年');
        expect(TurnManager.eraName(626)).toBe('武德九年');
    });
});
```

- [ ] **Step 2: 写失败测试 `tests/resource.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveTurn, type CityState } from '../assets/scripts/core/ResourceSystem';

function makeCity(partial: Partial<CityState>): CityState {
    return {
        id: 'c', name: '城', faction: 'tang', population: 10, food: 1000,
        gold: 100, army: 5000, defense: 5, morale: 80, generalId: null,
        ...partial
    };
}

describe('ResourceSystem 回合结算', () => {
    it('有粮时：金产 + 粮产 - 军粮消耗', () => {
        const city = makeCity({ gold: 100, food: 1000, army: 4000, population: 10 });
        const res = resolveTurn([city], 5);
        expect(res.deltas.gold).toBeGreaterThan(0);
        // 军粮 = 4000/1000 * 5 = 20；粮产来自人口（1 万人口产 100 粮）
        expect(res.deltas.food).toBe(100 - 20);
        expect(res.events.length).toBe(0);
    });

    it('缺粮时：触发缺粮事件且民心下降', () => {
        const city = makeCity({ food: 5, army: 4000, morale: 80 });
        const res = resolveTurn([city], 5);
        expect(res.deltas.food).toBeLessThan(0);
        expect(res.events.some((e) => e.cityId === 'c' && e.type === 'food-shortage')).toBe(true);
        expect(city.morale).toBeLessThan(80);
    });

    it('军队超过粮草上限会逃兵', () => {
        const city = makeCity({ food: 0, army: 4000, morale: 80 });
        const res = resolveTurn([city], 5);
        expect(city.army).toBeLessThan(4000);
    });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run turn.test.ts resource.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 4: 创建 `assets/scripts/core/TurnManager.ts`**

```ts
import type { Season } from './Types';

const SEASONS: Season[] = ['春', '夏', '秋', '冬'];

const ERA_NAMES: Record<number, string> = {
    617: '大业十三年',
    618: '大业十四年·武德元年',
    619: '武德二年',
    620: '武德三年',
    621: '武德四年',
    622: '武德五年',
    623: '武德六年',
    624: '武德七年',
    625: '武德八年',
    626: '武德九年'
};

export class TurnManager {
    constructor(
        public year: number,
        public seasonIndex: number,
        public turn: number = 0
    ) {}

    static eraName(year: number): string {
        return ERA_NAMES[year] ?? `武德${year - 617}年`;
    }

    getSeason(): Season {
        return SEASONS[this.seasonIndex];
    }

    getTurnNumber(): number {
        return this.turn;
    }

    advance(): void {
        this.seasonIndex += 1;
        if (this.seasonIndex >= SEASONS.length) {
            this.seasonIndex = 0;
            this.year += 1;
        }
        this.turn += 1;
    }
}
```

- [ ] **Step 5: 创建 `assets/scripts/core/ResourceSystem.ts`**

```ts
export interface CityState {
    id: string;
    name: string;
    faction: string;
    population: number;  // 万
    food: number;
    gold: number;
    army: number;
    defense: number;
    morale: number;
    generalId: string | null;
}

export interface TurnDelta {
    gold: number;
    food: number;
}

export interface CityEvent {
    cityId: string;
    type: 'food-shortage' | 'desertion' | 'morale-drop';
    message: string;
}

export interface TurnResult {
    deltas: TurnDelta;
    events: CityEvent[];
}

const FOOD_PER_POP_10K = 100;    // 每 1 万人口，每季产粮 100
const GOLD_PER_POP_10K = 40;     // 每 1 万人口，每季产金 40
const FOOD_PER_1000_ARMY = 5;    // 每千兵每季耗粮 5

export function resolveTurn(cities: CityState[], armyFoodPerThousand = 5): TurnResult {
    let totalGold = 0;
    let totalFood = 0;
    const events: CityEvent[] = [];

    for (const c of cities) {
        const foodGain = Math.floor(c.population / 10) * FOOD_PER_POP_10K;
        const goldGain = Math.floor(c.population / 10) * GOLD_PER_POP_10K;
        const foodCost = Math.floor(c.army / 1000) * armyFoodPerThousand;

        c.gold += goldGain;
        c.food += foodGain - foodCost;
        totalGold += goldGain;
        totalFood += foodGain - foodCost;

        if (c.food < 0) {
            // 缺粮：按缺口比例逃兵，并降民心
            const shortage = Math.abs(c.food);
            const deserters = Math.min(c.army, Math.floor(shortage * 50));
            c.army -= deserters;
            c.morale = Math.max(0, c.morale - 10);
            c.food = 0;
            events.push({
                cityId: c.id,
                type: 'food-shortage',
                message: `${c.name}缺粮，逃兵 ${deserters}，民心大降`
            });
        } else if (c.morale < 30) {
            c.morale = Math.max(0, c.morale - 2);
            events.push({ cityId: c.id, type: 'morale-drop', message: `${c.name}民心不稳` });
        }
    }

    return { deltas: { gold: totalGold, food: totalFood }, events };
}
```

- [ ] **Step 6: 创建 `assets/scripts/core/EventBus.ts`**

```ts
type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
    private handlers = new Map<keyof Events, Array<Handler<unknown>>>();

    on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
        const list = this.handlers.get(type) ?? [];
        list.push(handler as Handler<unknown>);
        this.handlers.set(type, list);
    }

    off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
        const list = this.handlers.get(type) ?? [];
        this.handlers.set(type, list.filter((h) => h !== handler));
    }

    emit<K extends keyof Events>(type: K, payload: Events[K]): void {
        const list = this.handlers.get(type) ?? [];
        for (const h of list.slice()) {
            h(payload);
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run turn.test.ts resource.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 8: 提交**

```bash
git add assets/scripts/core/
git commit -m "feat(m1): add turn manager, resource resolution and event bus with tests"
```

---

## Task 4: Cocos 场景与启动装配（编辑器步骤）

**Files:**
- Create: `assets/scripts/Bootstrap.ts`
- Create: `assets/scripts/ui/InkTheme.ts`
- 场景：`assets/scenes/main.scene`（编辑器创建）

> 本任务在 Cocos Creator 编辑器中进行。先在编辑器打开项目（会自动生成 `.meta`），再做以下步骤。

- [ ] **Step 1: 创建 `assets/scripts/ui/InkTheme.ts`（先写代码，供后续组件引用）**

```ts
// 水墨古风配色与字体常量
export const InkTheme = {
    // 纸与墨
    paperLight: new Color(247, 238, 216, 255),
    paper: new Color(240, 229, 196, 255),
    ink: new Color(42, 36, 26, 255),
    inkSoft: new Color(90, 74, 42, 255),
    // 朱砂
    cinnabar: new Color(166, 58, 46, 255),
    cinnabarDark: new Color(140, 44, 34, 255),
    // 金
    gold: new Color(217, 178, 88, 255),
    // 资源
    goldText: new Color(255, 230, 160, 255),
    paperText: new Color(247, 236, 216, 255),
    darkText: new Color(51, 41, 27, 255),
    labelText: new Color(106, 82, 50, 255)
};

import { Color } from 'cc';
```

- [ ] **Step 2: 创建 `assets/scripts/Bootstrap.ts`**

```ts
import { _decorator, Component, Node, Canvas, Camera, view } from 'cc';
import { TurnManager } from './core/TurnManager';
import { EventBus } from './core/EventBus';
import { MapRenderer } from './map/MapRenderer';
import { MapCamera } from './map/MapCamera';
import { TopBar } from './ui/TopBar';
import { BottomNav } from './ui/BottomNav';
import { CitySheet } from './ui/CitySheet';
import { CITIES } from './data/Cities';

const { ccclass } = _decorator;

// 全局事件类型
export interface GameEvents {
    'turn-advanced': { year: number; season: string; turn: number };
    'city-selected': { cityId: string };
}

@ccclass('Bootstrap')
export class Bootstrap extends Component {
    private bus = new EventBus<GameEvents>();
    private turns = new TurnManager(617, 2);

    onLoad(): void {
        view.setDesignResolutionSize(750, 1334, 2); // 竖屏 750x1334
        this.buildUi();
    }

    private buildUi(): void {
        const map = new Node('Map');
        this.node.addChild(map);
        map.addComponent(MapRenderer).init(this.bus, CITIES);
        map.addComponent(MapCamera);

        const top = new Node('TopBar');
        this.node.addChild(top);
        top.addComponent(TopBar).init(this.turns, this.bus);

        const nav = new Node('BottomNav');
        this.node.addChild(nav);
        nav.addComponent(BottomNav).init(this.bus);

        const sheet = new Node('CitySheet');
        this.node.addChild(sheet);
        sheet.addComponent(CitySheet).init(this.bus, CITIES);

        // 回合推进：TopBar 的按钮调用
        this.bus.on('turn-advanced', (p) => {
            console.log(`[回合] ${p.year} ${p.season} 第 ${p.turn} 回合`);
        });
    }
}
```

> 说明：`MapRenderer`、`MapCamera`、`TopBar`、`BottomNav`、`CitySheet` 将在 Task 5—8 创建；若编译器报缺模块，先完成后续任务再回到编辑器验证。

- [ ] **Step 3: 在编辑器创建最小场景**
1. 打开工程（Cocos Creator 3.8）
2. 资源管理器右键 `assets/scenes` → 新建 → Scene，命名为 `main`
3. 双击打开 `main.scene`
4. 层级管理器右键 → 创建 → **Canvas**（编辑器会自动生成 Canvas + Camera 子节点）
5. 在 Canvas 下新建空节点，命名 `Game`
6. 选中 `Game` 节点 → 属性检查器 → 添加组件 → 自定义脚本 → `Bootstrap`
7. 保存场景（Ctrl+S）

- [ ] **Step 4: 设置竖屏适配**
1. 选中 `Canvas` 节点 → 属性检查器 → `Canvas` 组件 → 勾选 `Fit Height` 与 `Fit Width`（配合 Bootstrap 中 `setDesignResolutionSize(750,1334,2)`）
2. 选中 `Canvas/Camera` 子节点 → `Camera` 组件 → `Projection` 选 `ORTHO`，`OrthoHeight` 约 667（=1334/2）

- [ ] **Step 5: 启动预览验证**
点击编辑器顶部 **预览** 按钮（浏览器或模拟器）。
Expected: 出现竖屏空白页面（黑屏或有 Canvas 默认背景）。此时 Bootstrap 因依赖组件未创建会报错属预期，完成 Task 5—8 后重试。

- [ ] **Step 6: 提交**

```bash
git add assets/scripts/Bootstrap.ts assets/scripts/ui/InkTheme.ts assets/scenes/
git commit -m "feat(m1): add bootstrap, ink theme and minimal main scene"
```

---

## Task 5: 舆图渲染 MapRenderer（Graphics）

**Files:**
- Create: `assets/scripts/map/MapRenderer.ts`

- [ ] **Step 1: 创建 `assets/scripts/map/MapRenderer.ts`**

```ts
import { _decorator, Component, Graphics, UITransform, Node, Color } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';
import { getFaction } from '../data/Factions';
import { InkTheme } from '../ui/InkTheme';

const { ccclass } = _decorator;

const VIEW_W = 640;
const VIEW_H = 560;

// 势力领土（粗示意多边形，viewBox 坐标）
const TERRITORY: Record<string, string> = {
    liang: 'M150 208 L206 214 L204 258 L154 250 Z',
    qin: 'M186 236 L238 232 L242 286 L196 290 Z',
    liu: 'M208 172 L276 158 L300 178 L292 212 L252 216 L216 206 Z',
    xia: 'M306 130 L368 120 L400 142 L412 186 L406 252 L392 262 L338 238 L320 214 L308 206 Z',
    yan: 'M326 130 L372 124 L378 158 L350 168 L330 162 Z',
    tang: 'M238 218 L260 196 L298 190 L326 200 L328 236 L300 268 L268 286 L244 266 Z',
    zheng: 'M278 246 L330 244 L330 286 L278 288 Z',
    wa: 'M304 252 L378 256 L380 292 L306 292 Z',
    sui: 'M344 306 L378 306 L378 330 L344 330 Z',
    wu: 'M338 288 L388 290 L386 318 L338 316 Z',
    shen: 'M364 298 L424 308 L424 386 L378 392 L364 374 Z',
    lin: 'M320 374 L372 378 L366 414 L326 408 Z',
    chu: 'M232 330 L332 338 L384 418 L352 482 L268 472 L230 398 Z'
};

const RIVERS = [
    { d: 'M140 235 L230 248 L300 255 L360 268 L400 252 L450 240 L505 252', name: '黄河', nx: 180, ny: 244 },
    { d: 'M228 360 L270 352 L300 346 L340 328 L360 316 L388 312 L415 330 L470 340', name: '长江', nx: 252, ny: 368 }
];

@ccclass('MapRenderer')
export class MapRenderer extends Component {
    private cities: CityDef[] = [];
    private selectedCityId: string | null = null;
    private graphics!: Graphics;
    private root!: Node;

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.cities = cities;
        this.createCanvas();
        this.drawAll();
        bus.on('city-selected', (p) => {
            this.selectedCityId = p.cityId;
            this.drawAll();
        });
        return this;
    }

    private createCanvas(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(VIEW_W * 2, VIEW_H * 2);

        // 纸色底
        const bg = new Node('Paper');
        bg.addComponent(UITransform).setContentSize(VIEW_W * 2, VIEW_H * 2);
        const bgG = bg.addComponent(Graphics);
        bgG.fillColor = InkTheme.paper;
        bgG.rect(-VIEW_W, -VIEW_H, VIEW_W * 2, VIEW_H * 2);
        bgG.fill();
        this.node.addChild(bg);

        // 主绘图图层
        this.root = new Node('Map');
        this.root.addComponent(UITransform).setContentSize(VIEW_W * 2, VIEW_H * 2);
        this.graphics = this.root.addComponent(Graphics);
        this.node.addChild(this.root);
    }

    private toLocal(x: number, y: number): { x: number; y: number } {
        // viewBox(640x560) -> 节点坐标（中心对齐，2 倍缩放）
        return { x: (x - VIEW_W / 2) * 2, y: (y - VIEW_H / 2) * 2 };
    }

    private drawAll(): void {
        const g = this.graphics;
        g.clear();
        this.drawGrid(g);
        this.drawTerritory(g);
        this.drawRivers(g);
        this.drawRoads(g);
        this.drawCities(g);
    }

    private drawGrid(g: Graphics): void {
        g.strokeColor = new Color(138, 116, 72, 60);
        g.lineWidth = 1;
        for (let x = 0; x <= VIEW_W; x += 40) {
            const p1 = this.toLocal(x, 0);
            const p2 = this.toLocal(x, VIEW_H);
            g.moveTo(p1.x, p1.y);
            g.lineTo(p2.x, p2.y);
        }
        for (let y = 0; y <= VIEW_H; y += 40) {
            const p1 = this.toLocal(0, y);
            const p2 = this.toLocal(VIEW_W, y);
            g.moveTo(p1.x, p1.y);
            g.lineTo(p2.x, p2.y);
        }
        g.stroke();
    }

    private drawTerritory(g: Graphics): void {
        for (const key of Object.keys(TERRITORY)) {
            const f = getFaction(key);
            const col = new Color();
            col.fromHEX(f.color);
            g.fillColor = col;
            g.fillColor.a = 40;
            this.tracePath(g, TERRITORY[key]);
            g.fill();
            g.strokeColor = col;
            g.strokeColor.a = 150;
            g.lineWidth = 2;
            this.tracePath(g, TERRITORY[key]);
            g.stroke();
        }
    }

    private tracePath(g: Graphics, d: string): void {
        // 解析 "M x y L x y ..." 简式路径
        const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        let i = 0;
        let started = false;
        while (i + 1 < nums.length) {
            const p = this.toLocal(nums[i], nums[i + 1]);
            if (!started) {
                g.moveTo(p.x, p.y);
                started = true;
            } else {
                g.lineTo(p.x, p.y);
            }
            i += 2;
        }
        g.close();
    }

    private drawRivers(g: Graphics): void {
        for (const r of RIVERS) {
            const nums = r.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            g.lineWidth = 6;
            g.strokeColor = new Color(63, 106, 138, 200);
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const p = this.toLocal(nums[i], nums[i + 1]);
                if (i === 0) {
                    g.moveTo(p.x, p.y);
                } else {
                    g.lineTo(p.x, p.y);
                }
            }
            g.stroke();
        }
    }

    private drawRoads(g: Graphics): void {
        const roads = [
            'M270 275 L300 262', 'M298 215 L270 275', 'M300 262 L318 205',
            'M292 350 L255 355', 'M300 262 L322 270 L358 278'
        ];
        g.lineWidth = 2;
        g.strokeColor = new Color(138, 106, 63, 180);
        for (const d of roads) {
            const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const p = this.toLocal(nums[i], nums[i + 1]);
                if (i === 0) {
                    g.moveTo(p.x, p.y);
                } else {
                    g.lineTo(p.x, p.y);
                }
            }
            g.stroke();
        }
    }

    private drawCities(g: Graphics): void {
        for (const c of this.cities) {
            const f = getFaction(c.faction);
            const p = this.toLocal(c.x, c.y);
            const col = new Color();
            col.fromHEX(f.color);
            const selected = c.id === this.selectedCityId;
            g.fillColor = col;
            g.strokeColor = selected ? Color.WHITE : new Color(51, 40, 26, 255);
            g.lineWidth = selected ? 4 : 2;
            if (c.tier === 1) {
                g.rect(p.x - 10, p.y - 10, 20, 20);
                g.fill();
                g.stroke();
            } else {
                g.circle(p.x, p.y, 7);
                g.fill();
                g.stroke();
            }
        }
    }
}
```

- [ ] **Step 2: 编辑器预览验证**
在 Cocos Creator 打开项目 → 预览。
Expected: 屏幕中央出现水墨风格舆图：网格、势力色块、黄河/长江、城池方/圆点。城池标签（Label）本任务暂不绘制，Task 6 补交互与文字。

- [ ] **Step 3: 提交**

```bash
git add assets/scripts/map/MapRenderer.ts
git commit -m "feat(m1): render ink-wash strategy map with Graphics"
```

---

## Task 6: 地图交互 MapCamera（拖动 / 缩放 / 点选）

**Files:**
- Create: `assets/scripts/map/MapCamera.ts`

- [ ] **Step 1: 创建 `assets/scripts/map/MapCamera.ts`**

```ts
import { _decorator, Component, Node, UITransform, Vec2, EventTouch, input, Input } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';

const { ccclass } = _decorator;

@ccclass('MapCamera')
export class MapCamera extends Component {
    private cities: CityDef[] = [];
    private bus!: EventBus<GameEvents>;
    private moving = false;
    private last = new Vec2();

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.bus = bus;
        this.cities = cities;
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        input.on(Input.EventType.MOUSE_WHEEL, this.onWheel, this);
        return this;
    }

    private onTouchStart(e: EventTouch): void {
        this.moving = true;
        this.last.set(e.getUILocation().x, e.getUILocation().y);
    }

    private onTouchMove(e: EventTouch): void {
        if (!this.moving) {
            return;
        }
        const cur = e.getUILocation();
        const dx = cur.x - this.last.x;
        const dy = cur.y - this.last.y;
        const pos = this.node.position;
        this.node.setPosition(pos.x + dx, pos.y + dy, pos.z);
        this.last.set(cur.x, cur.y);
    }

    private onTouchEnd(e: EventTouch): void {
        this.moving = false;
        // 点选城池：将 UI 坐标映射到 viewBox 坐标
        const ui = e.getUILocation();
        const pos = this.node.position;
        const scale = this.node.scale.x;
        // 屏中心即 viewBox 中心
        const relX = (ui.x - pos.x - 375) / (640 * scale);
        const relY = (ui.y - pos.y - 667) / (560 * scale);
        const wx = 320 + relX * 640;
        const wy = 280 + relY * 560;
        let best: CityDef | null = null;
        let bestDist = 40; // viewBox 内点选半径
        for (const c of this.cities) {
            const d = Math.hypot(c.x - wx, c.y - wy);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        if (best) {
            this.bus.emit('city-selected', { cityId: best.id });
        }
    }

    private onWheel(e: { getScrollY: () => number }): void {
        const delta = e.getScrollY() > 0 ? 1.1 : 0.9;
        const s = this.node.scale.x * delta;
        if (s >= 0.6 && s <= 2.4) {
            this.node.setScale(s, s, 1);
        }
    }
}
```

> 说明：`MapRenderer` 的 `init` 同时被 Bootstrap 调用；为简化，由 Bootstrap 负责把 `cities` 传给两个组件（Bootstrap 中给 `MapCamera` 也补一句 `map.getComponent(MapCamera).init(bus, CITIES)`）。本任务中城市标签（名称 Label）在 `MapRenderer` 内用 Label 节点补充（见 Step 2）。

- [ ] **Step 2: 给城池添加名称 Label**

在 `MapRenderer.ts` 的 `init` 中，`this.drawAll()` 之后调用新增的 `drawCityLabels()`：

```ts
// 追加到 init：
this.drawCityLabels();
```

并在类中新增方法：

```ts
import { Label } from 'cc';

private drawCityLabels(): void {
    for (const c of this.cities) {
        const labelNode = new Node(`Label_${c.name}`);
        const label = labelNode.addComponent(Label);
        label.string = c.name;
        label.fontSize = c.tier === 1 ? 26 : 22;
        label.lineHeight = 30;
        label.useSystemFont = true;
        label.color = new Color(43, 33, 22, 255);
        const p = this.toLocal(c.x, c.y);
        labelNode.setPosition(p.x, p.y + (c.tier === 1 ? 30 : 26), 1);
        this.root.addChild(labelNode);
    }
}
```

> 注：`import { Label } from 'cc'` 追加到 MapRenderer.ts 顶部 import 行。

- [ ] **Step 3: 更新 Bootstrap 传入 cities 给 MapCamera**

修改 `assets/scripts/Bootstrap.ts`：

```ts
map.addComponent(MapCamera);
// 改为：
const cam = map.addComponent(MapCamera);
cam.init(this.bus, CITIES);
```

- [ ] **Step 4: 编辑器预览验证**
Expected: 地图可单指拖动、滚轮缩放；点击城池会在侧栏（Task 7 顶部栏 / Task 8 城池卡）触发选中效果——尚未实现 UI 时可先看控制台 `city-selected` 日志（需临时在 Bootstrap 打印）。本任务验证点选命中与拖动缩放无报错即可。

- [ ] **Step 5: 提交**

```bash
git add assets/scripts/map/MapCamera.ts assets/scripts/map/MapRenderer.ts assets/scripts/Bootstrap.ts
git commit -m "feat(m1): add map pan/zoom and city picking"
```

---

## Task 7: 顶部状态栏 TopBar（回合推进）

**Files:**
- Create: `assets/scripts/ui/TopBar.ts`

- [ ] **Step 1: 创建 `assets/scripts/ui/TopBar.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import { TurnManager } from '../core/TurnManager';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('TopBar')
export class TopBar extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;
    private eraLabel!: Label;

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.turns = turns;
        this.bus = bus;
        this.build();
        return this;
    }

    private build(): void {
        const bar = this.node.addComponent(UITransform);
        bar.setContentSize(750, 120);
        this.node.setPosition(0, 667 - 60, 1);

        // 底
        const bg = this.makeBar('top-bg', 750, 120);
        this.node.addChild(bg);

        // 年代
        this.eraLabel = this.makeLabel(
            `${TurnManager.eraName(this.turns.year)} · ${this.turns.getSeason()}`,
            32, InkTheme.goldText, 30, 60
        );
        this.node.addChild(this.eraLabel.node);

        // 势力
        const fac = this.makeLabel('大唐 · 李渊', 24, InkTheme.paperText, 30, 0);
        this.node.addChild(fac.node);

        // 回合按钮
        const btnNode = new Node('NextTurn');
        const btn = btnNode.addComponent(NextTurnButton);
        btn.init(this.turns, this.bus);
        btnNode.setPosition(360, -30, 1);
        this.node.addChild(btnNode);
    }

    private makeBar(name: string, w: number, h: number): Node {
        const n = new Node(name);
        n.addComponent(UITransform).setContentSize(w, h);
        return n;
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(400, 50);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        return l;
    }
}

@ccclass('NextTurnButton')
export class NextTurnButton extends Component {
    private turns!: TurnManager;
    private bus!: EventBus<GameEvents>;

    init(turns: TurnManager, bus: EventBus<GameEvents>): this {
        this.turns = turns;
        this.bus = bus;
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(160, 80);
        const label = this.node.addComponent(Label);
        label.string = '下回合';
        label.fontSize = 30;
        label.lineHeight = 38;
        label.color = InkTheme.paperText;
        label.useSystemFont = true;
        this.node.on(Node.EventType.TOUCH_END, this.onTap, this);
        return this;
    }

    private onTap(): void {
        this.turns.advance();
        this.bus.emit('turn-advanced', {
            year: this.turns.year,
            season: this.turns.getSeason(),
            turn: this.turns.getTurnNumber()
        });
    }
}
```

> 说明：TopBar 的深色墨底、资源栏等视觉将在 M6 打磨；M1 先实现年代显示 + 回合按钮 + 事件发布。`makeLabel` 返回 Label，调用处取 `.node`。

- [ ] **Step 2: 更新 Bootstrap 装配 TopBar 的 UI 父级**

Bootstrap 中 `top.addComponent(TopBar).init(this.turns, this.bus)` 已满足；无需改动（TopBar 自身在 `build()` 里建子节点）。

- [ ] **Step 3: 编辑器预览验证**
Expected: 顶部显示「大业十三年 · 秋 / 大唐 · 李渊」与「下回合」按钮；点击按钮后年代变为「大业十三年 · 冬」，控制台打印回合日志；再点 3 次跨年为「大业十四年 · 春」。

- [ ] **Step 4: 提交**

```bash
git add assets/scripts/ui/TopBar.ts
git commit -m "feat(m1): add top bar with turn advance button"
```

---

## Task 8: 城池底部卡片 CitySheet + 底部导航 BottomNav 骨架

**Files:**
- Create: `assets/scripts/ui/CitySheet.ts`
- Create: `assets/scripts/ui/BottomNav.ts`

- [ ] **Step 1: 创建 `assets/scripts/ui/CitySheet.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityDef } from '../core/Types';
import { getFaction } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('CitySheet')
export class CitySheet extends Component {
    private bus!: EventBus<GameEvents>;
    private cities: CityDef[] = [];
    private titleLabel!: Label;
    private infoLabel!: Label;
    private rootNode!: Node;

    init(bus: EventBus<GameEvents>, cities: CityDef[]): this {
        this.bus = bus;
        this.cities = cities;
        this.build();
        bus.on('city-selected', (p) => this.showCity(p.cityId));
        return this;
    }

    private build(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(700, 300);
        this.node.setPosition(0, -667 + 170, 2);

        this.rootNode = new Node('sheet');
        this.rootNode.addComponent(UITransform).setContentSize(700, 300);
        this.node.addChild(this.rootNode);

        this.titleLabel = this.addLabel('', 36, InkTheme.darkText, 0, 90);
        this.infoLabel = this.addLabel('', 26, InkTheme.labelText, 0, 20);
        this.hide();
    }

    private addLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(600, 40);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.rootNode.addChild(n);
        return l;
    }

    private showCity(cityId: string): void {
        const c = this.cities.find((item) => item.id === cityId);
        if (!c) {
            return;
        }
        const f = getFaction(c.faction);
        this.titleLabel.string = c.name;
        this.infoLabel.string =
            `${f.name}\n人口 — · 兵力 — · 守将 —\n民心 — · 城防 —（M2 起填充数值）`;
        this.show();
    }

    private show(): void {
        this.rootNode.active = true;
    }

    private hide(): void {
        this.rootNode.active = false;
    }
}
```

- [ ] **Step 2: 创建 `assets/scripts/ui/BottomNav.ts`**

```ts
import { _decorator, Component, Node, Label, UITransform, Color } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

const TABS = [
    { key: 'gov', text: '政', label: '内政' },
    { key: 'mil', text: '兵', label: '军事' },
    { key: 'gen', text: '将', label: '将领' },
    { key: 'dip', text: '盟', label: '外交' },
    { key: 'str', text: '谋', label: '谋略' }
];

@ccclass('BottomNav')
export class BottomNav extends Component {
    private bus!: EventBus<GameEvents>;
    private activeKey = 'gov';

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.build();
        return this;
    }

    private build(): void {
        const rt = this.node.addComponent(UITransform);
        rt.setContentSize(750, 140);
        this.node.setPosition(0, -667 + 70, 2);

        TABS.forEach((t, i) => {
            const x = -300 + i * 150;
            const n = new Node(t.label);
            n.addComponent(UITransform).setContentSize(120, 120);
            const icon = n.addComponent(Label);
            icon.string = t.text;
            icon.fontSize = 44;
            icon.lineHeight = 52;
            icon.color = InkTheme.goldText;
            icon.useSystemFont = true;
            n.setPosition(x, 20, 1);
            this.node.addChild(n);
            n.on(Node.EventType.TOUCH_END, () => {
                this.activeKey = t.key;
                console.log(`[导航] 切到「${t.label}」（功能面板 M4 实现）`);
            });
        });
    }
}
```

- [ ] **Step 3: 编辑器预览验证**
Expected: 点击城池 → 底部弹出城池卡（显示城名与势力）；点其他城池切换；底部导航 5 个图标可点，控制台打印「切到…」。地图拖动/缩放手感正常。

- [ ] **Step 4: 提交**

```bash
git add assets/scripts/ui/CitySheet.ts assets/scripts/ui/BottomNav.ts
git commit -m "feat(m1): add city detail sheet and bottom nav skeleton"
```

---

## Task 9: M1 收尾验证

- [ ] **Step 1: 全量单测**

Run（在 `tests` 目录）：`npx vitest run`
Expected: 全部 PASS（数据表 6 + 回合/资源 7 = 13 个用例）

- [ ] **Step 2: 编辑器完整预览**
在 Cocos Creator 打开 `main.scene` 预览：
1. 竖屏水墨舆图正常渲染（网格 / 势力色块 / 江河 / 城池）
2. 单指拖动地图、滚轮缩放
3. 点击城池弹出底部卡片并切换
4. 顶部显示年代，点击「下回合」推进季节并跨年
5. 控制台无报错

- [ ] **Step 3: 更新 README（项目根）**

```markdown
# 隋唐风云

隋末唐初策略手游（Cocos Creator 3.8 + TypeScript）。

## 运行
1. 用 Cocos Creator 3.8 打开本目录
2. 打开 `assets/scenes/main.scene`，点击预览

## 测试（纯逻辑）
cd tests && npm install && npm test
```

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs(m1): add README for M1 framework"
```

---

## 自审记录

- **Spec 覆盖**：M1 覆盖设计文档第 2（回合）、第 3（资源结算）、第 4（舆图 22 城与 13 势力数据）、第 11（竖屏布局骨架）、第 12（模块划分 core/data/map/ui）。M2 内政、M3 军事、M4 将领外交谋略、M5 AI 事件、M6 打磨将各成独立计划。
- **占位符扫描**：无 TBD/TODO；城池数值面板「M2 起填充」为跨里程碑的明确交接点，非占位。
- **类型一致性**：`EventBus<GameEvents>`、`TurnManager`、`CityDef`、`getFaction/getCity` 签名在 Task 2—8 间保持一致；`MapCamera.init` 与 `MapRenderer.init` 均接收 `(bus, cities)`。
