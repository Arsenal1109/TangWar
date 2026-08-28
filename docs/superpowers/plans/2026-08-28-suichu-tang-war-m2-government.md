# M2 内政实现计划：施策 + 设施 + 城池状态

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 为 M1 增加内政系统：城池状态注册表、六种施策、四种城池设施（影响产出）、内政面板 UI。

**Architecture:** 延续 M1 分层——`data/Policies.ts` 与 `core/PolicySystem.ts`、`core/FacilitySystem.ts`、`core/CityRegistry.ts` 引擎无关（可单测）；`ui/GovernmentPanel.ts` 只负责渲染与调用纯逻辑。`CityState` 增加 `facilities` 与 `policyUsed` 字段，`ResourceSystem` 产出按设施等级加成。

**Tech Stack:** 同 M1（Cocos Creator 3.8 + TypeScript，node + vitest 单测）。

---

## 文件结构（M2 新增/修改）

```
assets/scripts/
├── core/
│   ├── ResourceSystem.ts      # 修改：+facilities/policyUsed，产出按设施加成，仓廪减缺粮
│   ├── PolicySystem.ts        # 新增：applyPolicy（每城每季一次）
│   ├── FacilitySystem.ts      # 新增：buildFacility / facilityCost
│   └── CityRegistry.ts        # 新增：createCityStates / findCity / resetTurnFlags
├── data/
│   └── Policies.ts            # 新增：六种施策数据表
└── ui/
    └── GovernmentPanel.ts     # 新增：内政面板（底部弹层）
tests/
├── policy.test.ts             # 新增
├── facility.test.ts           # 新增
└── resource.test.ts           # 修改：makeCity 补默认字段
```

## Task 1: 扩展 CityState 与 ResourceSystem

**Files:** Modify `assets/scripts/core/ResourceSystem.ts`、`tests/resource.test.ts`

- [ ] **Step 1: 修改 `ResourceSystem.ts`**（在 `CityState` 增加 `facilities`、`policyUsed`；产出按设施加成）

```ts
export interface CityFacilities {
    farm: number;     // 农田 0..3
    market: number;   // 商市 0..3
    barracks: number; // 兵营 0..3
    granary: number;  // 仓廪 0..3
}

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
    facilities: CityFacilities;
    policyUsed: boolean;
}
```

`resolveTurn` 内产出改为：

```ts
const foodGain = Math.floor(c.population / 10) * FOOD_PER_POP_10K * (1 + 0.2 * c.facilities.farm);
const goldGain = Math.floor(c.population / 10) * GOLD_PER_POP_10K * (1 + 0.2 * c.facilities.market);
```

缺粮分支加入仓廪缓冲（每级 300 粮）后再逃兵：

```ts
if (c.food < 0) {
    const shortage = -c.food;
    const absorbed = Math.min(c.facilities.granary * 300, shortage);
    c.food += absorbed;
    const remain = -c.food;
    if (remain > 0) {
        const deserters = Math.min(c.army, Math.floor(remain * 50));
        c.army -= deserters;
        c.morale = Math.max(0, c.morale - 10);
        c.food = 0;
        events.push({ cityId: c.id, type: 'food-shortage', message: `${c.name}缺粮，逃兵 ${deserters}，民心大降` });
    }
}
```

- [ ] **Step 2: 修改 `tests/resource.test.ts` 的 makeCity 补默认字段**

```ts
return {
    id: 'c', name: '城', faction: 'tang', population: 10, food: 1000,
    gold: 100, army: 5000, defense: 5, morale: 80, generalId: null,
    facilities: { farm: 0, market: 0, barracks: 0, granary: 0 },
    policyUsed: false,
    ...partial
};
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run resource.test.ts`
Expected: PASS（3 用例；默认设施 0 级不改原数值）

## Task 2: 施策数据表与施策系统（纯逻辑）

**Files:** Create `assets/scripts/data/Policies.ts`、`assets/scripts/core/PolicySystem.ts`、`tests/policy.test.ts`

- [ ] **Step 1: 写失败测试 `tests/policy.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { applyPolicy } from '../assets/scripts/core/PolicySystem';
import { POLICIES } from '../assets/scripts/data/Policies';
import type { CityState } from '../assets/scripts/core/ResourceSystem';

function makeCity(partial: Partial<CityState>): CityState {
    return {
        id: 'c', name: '城', faction: 'tang', population: 10, food: 2000,
        gold: 2000, army: 5000, defense: 5, morale: 80, generalId: null,
        facilities: { farm: 1, market: 0, barracks: 0, granary: 0 }, policyUsed: false,
        ...partial
    };
}

describe('PolicySystem 施策', () => {
    it('劝课农桑：扣金 + 加粮 + 民心，并置 policyUsed', () => {
        const c = makeCity({ food: 2000, gold: 2000, morale: 80 });
        const res = applyPolicy(c, 'farming');
        expect(res.ok).toBe(true);
        expect(c.gold).toBe(2000 - 300);
        expect(c.food).toBe(2000 + 400);
        expect(c.morale).toBe(82);
        expect(c.policyUsed).toBe(true);
    });

    it('同一季不能二次施策', () => {
        const c = makeCity({});
        applyPolicy(c, 'farming');
        const res = applyPolicy(c, 'walls');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('本季已施行过内政');
    });

    it('黄金不足被拒绝', () => {
        const c = makeCity({ gold: 100 });
        const res = applyPolicy(c, 'walls');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('黄金不足');
    });

    it('应有六种施策且 id 唯一', () => {
        const ids = POLICIES.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(POLICIES.length).toBe(6);
    });
});
```

- [ ] **Step 2: 创建 `assets/scripts/data/Policies.ts`**

```ts
export interface PolicyEffects {
    food: number;       // 立即粮草变动
    gold: number;       // 立即黄金变动
    population: number; // 人口变动（万）
    morale: number;     // 民心变动
    defense: number;    // 城防变动
    army: number;       // 兵力变动
}

export interface PolicyDef {
    id: string;
    name: string;
    desc: string;
    costGold: number;
    costFood: number;
    effects: PolicyEffects;
}

export const POLICIES: PolicyDef[] = [
    { id: 'farming', name: '劝课农桑', desc: '耗金 300 · 粮 +400 · 民心 +2', costGold: 300, costFood: 0, effects: { food: 400, gold: 0, population: 0, morale: 2, defense: 0, army: 0 } },
    { id: 'relief', name: '开仓济民', desc: '耗粮 800 · 民心 +8', costGold: 0, costFood: 800, effects: { food: 0, gold: 0, population: 0, morale: 8, defense: 0, army: 0 } },
    { id: 'migrate', name: '招募流民', desc: '耗金 500 · 人口 +1.2万', costGold: 500, costFood: 0, effects: { food: 0, gold: 0, population: 1.2, morale: 1, defense: 0, army: 0 } },
    { id: 'walls', name: '修城筑防', desc: '耗金 600 · 城防 +5', costGold: 600, costFood: 0, effects: { food: 0, gold: 0, population: 0, morale: 0, defense: 5, army: 0 } },
    { id: 'drill', name: '整顿军备', desc: '耗金 700 · 兵 +800 · 民心 -2', costGold: 700, costFood: 0, effects: { food: 0, gold: 0, population: 0, morale: -2, defense: 0, army: 800 } },
    { id: 'levy', name: '加征赋税', desc: '金 +500 · 民心 -6', costGold: 0, costFood: 0, effects: { food: 0, gold: 500, population: 0, morale: -6, defense: 0, army: 0 } }
];

export function getPolicy(id: string): PolicyDef {
    const p = POLICIES.find((item) => item.id === id);
    if (!p) {
        throw new Error(`未知施策: ${id}`);
    }
    return p;
}
```

- [ ] **Step 3: 创建 `assets/scripts/core/PolicySystem.ts`**

```ts
import type { CityState } from './ResourceSystem';
import { getPolicy } from '../data/Policies';

export interface ApplyResult {
    ok: boolean;
    reason: string;
}

function clamp(v: number): number {
    return Math.max(0, Math.min(100, v));
}

export function applyPolicy(city: CityState, policyId: string): ApplyResult {
    if (city.policyUsed) {
        return { ok: false, reason: '本季已施行过内政' };
    }
    const p = getPolicy(policyId);
    if (city.gold < p.costGold) {
        return { ok: false, reason: '黄金不足' };
    }
    if (city.food < p.costFood) {
        return { ok: false, reason: '粮草不足' };
    }
    city.gold -= p.costGold;
    city.food -= p.costFood;
    city.gold += p.effects.gold;
    city.food += p.effects.food;
    city.population += p.effects.population;
    city.morale = clamp(city.morale + p.effects.morale);
    city.defense += p.effects.defense;
    city.army += p.effects.army;
    city.policyUsed = true;
    return { ok: true, reason: '' };
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run policy.test.ts`
Expected: PASS（4 用例）

## Task 3: 设施系统与城池注册表（纯逻辑）

**Files:** Create `assets/scripts/core/FacilitySystem.ts`、`assets/scripts/core/CityRegistry.ts`、`tests/facility.test.ts`

- [ ] **Step 1: 写失败测试 `tests/facility.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildFacility, facilityCost, facilityName } from '../assets/scripts/core/FacilitySystem';
import { createCityStates, resetTurnFlags } from '../assets/scripts/core/CityRegistry';
import { resolveTurn } from '../assets/scripts/core/ResourceSystem';

describe('FacilitySystem 设施', () => {
    it('建设农田：扣金、升级、名称正确', () => {
        const [c] = createCityStates();
        const res = buildFacility(c, 'farm');
        expect(res.ok).toBe(true);
        expect(c.facilities.farm).toBe(2);
        expect(c.gold).toBeLessThan(600);
        expect(facilityName('market')).toBe('商市');
    });

    it('满级（3 级）不能再建', () => {
        const [c] = createCityStates();
        c.facilities.farm = 3;
        const res = buildFacility(c, 'farm');
        expect(res.ok).toBe(false);
    });

    it('设施等级越高产出越高（农田 +20%/级）', () => {
        const low = createCityStates()[0];
        low.facilities.farm = 0;
        low.facilities.market = 0;
        const high = createCityStates()[0];
        high.facilities.farm = 3;
        high.facilities.market = 3;
        // 人口 15（州府）：基础粮 150，+60% = 240；基础金 60，+60% = 96
        const rLow = resolveTurn([low]);
        const rHigh = resolveTurn([high]);
        expect(rHigh.deltas.food).toBeGreaterThan(rLow.deltas.food);
        expect(rHigh.deltas.gold).toBeGreaterThan(rLow.deltas.gold);
    });

    it('仓廪缓冲缺粮：0 级逃兵，3 级不全逃', () => {
        const no = createCityStates()[0];
        no.facilities.granary = 0;
        no.population = 0; no.food = 0; no.army = 4000;
        const yes = createCityStates()[0];
        yes.facilities.granary = 3;
        yes.population = 0; yes.food = 0; yes.army = 4000;
        resolveTurn([no]);
        resolveTurn([yes]);
        expect(yes.army).toBeGreaterThan(no.army);
    });

    it('resetTurnFlags 清空各城 policyUsed', () => {
        const cities = createCityStates();
        cities[0].policyUsed = true;
        cities[1].policyUsed = true;
        resetTurnFlags(cities);
        expect(cities.every((c) => c.policyUsed === false)).toBe(true);
    });
});
```

- [ ] **Step 2: 创建 `assets/scripts/core/FacilitySystem.ts`**

```ts
import type { CityState } from './ResourceSystem';
import type { ApplyResult } from './PolicySystem';

export type FacilityType = 'farm' | 'market' | 'barracks' | 'granary';

export const FACILITY_MAX = 3;

export function facilityName(t: FacilityType): string {
    switch (t) {
        case 'farm': return '农田';
        case 'market': return '商市';
        case 'barracks': return '兵营';
        case 'granary': return '仓廪';
    }
}

export function facilityCost(t: FacilityType, level: number): number {
    return 300 + level * 200;
}

export function buildFacility(city: CityState, type: FacilityType): ApplyResult {
    const cur = city.facilities[type];
    if (cur >= FACILITY_MAX) {
        return { ok: false, reason: `${facilityName(type)}已到最高等级` };
    }
    const cost = facilityCost(type, cur);
    if (city.gold < cost) {
        return { ok: false, reason: '黄金不足' };
    }
    city.gold -= cost;
    city.facilities[type] += 1;
    return { ok: true, reason: '' };
}
```

- [ ] **Step 3: 创建 `assets/scripts/core/CityRegistry.ts`**

```ts
import { CITIES } from '../data/Cities';
import type { CityState } from './ResourceSystem';

export function createCityStates(): CityState[] {
    return CITIES.map((c) => ({
        id: c.id,
        name: c.name,
        faction: c.faction,
        population: c.tier === 1 ? 15 : 8,
        food: 2000,
        gold: 600,
        army: c.tier === 1 ? 8000 : 4000,
        defense: 5,
        morale: 80,
        generalId: null,
        facilities: { farm: 1, market: 0, barracks: 0, granary: 0 },
        policyUsed: false
    }));
}

export function findCity(states: CityState[], id: string): CityState | undefined {
    return states.find((c) => c.id === id);
}

export function resetTurnFlags(states: CityState[]): void {
    for (const c of states) {
        c.policyUsed = false;
    }
}
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run facility.test.ts`
Expected: PASS（5 用例）

## Task 4: 内政面板 UI（Cocos）

**Files:** Create `assets/scripts/ui/GovernmentPanel.ts`；Modify `assets/scripts/Bootstrap.ts`

- [ ] **Step 1: 创建 `assets/scripts/ui/GovernmentPanel.ts`**

```ts
import { _decorator, Component, Node, Label, UITransform, Color } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { POLICIES } from '../data/Policies';
import { applyPolicy } from '../core/PolicySystem';
import { findCity } from '../core/CityRegistry';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('GovernmentPanel')
export class GovernmentPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private titleLabel!: Label;
    private resLabel!: Label;
    private listRoot!: Node;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        bus.on('city-selected', (p) => {
            this.selectedId = p.cityId;
            this.refresh();
        });
        bus.on('turn-advanced', () => this.refresh());
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 520);
        this.node.setPosition(0, -667 + 300, 2);

        this.titleLabel = this.makeLabel('内政', 40, InkTheme.darkText, 0, 220);
        this.resLabel = this.makeLabel('', 24, InkTheme.labelText, 0, 160);
        this.listRoot = new Node('policy-list');
        this.node.addChild(this.listRoot);
        this.refresh();
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(650, 44);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return l;
    }

    private refresh(): void {
        const city = findCity(this.states, this.selectedId);
        if (!city) {
            return;
        }
        this.titleLabel.string = `${city.name} · 内政`;
        this.resLabel.string =
            `金 ${city.gold} · 粮 ${city.food} · 民心 ${city.morale} · 已施政 ${city.policyUsed ? '是' : '否'}`;

        this.listRoot.removeAllChildren();
        POLICIES.forEach((p, i) => {
            const row = new Node(p.name);
            row.addComponent(UITransform).setContentSize(650, 56);
            row.setPosition(0, 100 - i * 62, 1);
            const label = row.addComponent(Label);
            label.string = `${p.name} — ${p.desc}`;
            label.fontSize = 22;
            label.lineHeight = 28;
            label.color = InkTheme.darkText;
            label.useSystemFont = true;
            label.overflow = 3; // OVERFLOW_SHRINK
            row.on(Node.EventType.TOUCH_END, () => {
                const r = applyPolicy(city, p.id);
                console.log(`[内政] ${p.name}：${r.ok ? '施行成功' : r.reason}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}
```

- [ ] **Step 2: 修改 `assets/scripts/Bootstrap.ts`**

在 import 增加：

```ts
import { createCityStates, resetTurnFlags } from './core/CityRegistry';
import { GovernmentPanel } from './ui/GovernmentPanel';
```

`onLoad` 中创建状态并接线：

```ts
this.cityStates = createCityStates();
// ... 其余 UI 装配不变 ...

const gov = new Node('GovernmentPanel');
this.node.addChild(gov);
gov.addComponent(GovernmentPanel).init(this.bus, this.cityStates);

this.bus.on('turn-advanced', () => resetTurnFlags(this.cityStates));
```

并声明字段：`private cityStates: CityState[] = [];`（`import type { CityState } from './core/ResourceSystem';`）

> 注：GovernmentPanel 初始 `selectedId='taiyuan'`，与地图默认选中一致；地图点选会联动刷新。

- [ ] **Step 3: 编辑器预览验证**
Expected: 底部上方出现「内政」面板，显示当前城池资源与六种施策；点施策扣资源/生效并置「已施政 是」；同一季再次点击提示失败；点地图其他城池联动刷新；点「下回合」清空施政标记。

## Task 5: 全量验证与提交

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（data 5 + turn 4 + resource 3 + policy 4 + facility 5 = 21 用例）

- [ ] **Step 2: 提交**

```bash
git add assets/scripts tests
git commit -m "feat(m2): add governance policies, city facilities, city registry and government panel"
```
