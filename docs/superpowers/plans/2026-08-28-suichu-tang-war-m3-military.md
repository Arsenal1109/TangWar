# M3 军事实现计划：六兵种 + 募兵 + 行军 + 攻城结算 + 战报

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 为游戏加入军事系统：六兵种数据与克制矩阵、城池募兵、行军（按距离/兵种速度计回合）、攻城战结算（含城防/江河惩罚/将领加成）与演义化战报。

**Architecture:** 延续分层。`data/Troops.ts`（兵种表）与 `core/Army.ts`（兵力账本）、`core/Military.ts`（募兵）、`core/BattleSystem.ts`（战结算）、`core/MarchSystem.ts`（行军）引擎无关、可单测；`ui/MilitaryPanel.ts` 只做渲染与调用。`CityState` 增加 `troops: Record<TroopType, number>`，`army` 保持为总兵力（与 troops 同步）。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS，node + vitest）。战斗采用可注入 rng 的确定性结算，便于测试。

---

## 文件结构（M3）

```
assets/scripts/
├── core/
│   ├── ResourceSystem.ts      # 修改：CityState + troops 字段
│   ├── Army.ts                # 新增：addTroops / removeArmy / totalArmy
│   ├── Military.ts            # 新增：recruit 募兵
│   ├── BattleSystem.ts        # 新增：resolveBattle 攻城/野战结算
│   └── MarchSystem.ts         # 新增：行军回合计算与订单
├── data/
│   └── Troops.ts              # 新增：六兵种数据 + 克制矩阵
├── core/CityRegistry.ts       # 修改：createCityStates 初始化 troops
└── ui/
    └── MilitaryPanel.ts       # 新增：募兵面板
tests/
├── troops.test.ts             # 新增
├── military.test.ts           # 新增
├── battle.test.ts             # 新增
├── march.test.ts              # 新增
└── resource/policy/facility.test.ts  # 修改：makeCity 补 troops
```

## Task 1: 六兵种数据表（纯逻辑）

**Files:** Create `assets/scripts/data/Troops.ts`、`tests/troops.test.ts`

- [ ] **Step 1: 写失败测试 `tests/troops.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { TROOPS, TROOP_ORDER, troopName, COUNTER, isCounter } from '../assets/scripts/data/Troops';

describe('六兵种数据', () => {
    it('恰好六种且顺序唯一', () => {
        expect(TROOP_ORDER.length).toBe(6);
        expect(new Set(TROOP_ORDER).size).toBe(6);
    });

    it('每种兵种的招募价/粮耗/攻防/速度为正', () => {
        for (const t of TROOP_ORDER) {
            const d = TROOPS[t];
            expect(d.cost).toBeGreaterThan(0);
            expect(d.foodPerThousand).toBeGreaterThan(0);
            expect(d.atk).toBeGreaterThan(0);
            expect(d.def).toBeGreaterThan(0);
            expect(d.speed).toBeGreaterThan(0);
            expect(troopName(t).length).toBeGreaterThan(0);
        }
    });

    it('克制关系：骑兵克弩兵、玄甲军克骑兵、弩兵克玄甲军', () => {
        expect(isCounter('qibing', 'nubing')).toBe(true);
        expect(isCounter('xuanjia', 'qibing')).toBe(true);
        expect(isCounter('nubing', 'xuanjia')).toBe(true);
    });
});
```

- [ ] **Step 2: 创建 `assets/scripts/data/Troops.ts`**

```ts
export type TroopType = 'fubing' | 'jingbing' | 'qibing' | 'nubing' | 'xuanjia' | 'shuijun';

export interface TroopDef {
    id: TroopType;
    name: string;
    cost: number;           // 招募每千人耗金
    foodPerThousand: number;// 每千兵每季耗粮
    atk: number;            // 攻击
    def: number;            // 防御
    speed: number;          // 行军速度系数
}

export const TROOP_ORDER: TroopType[] = ['fubing', 'jingbing', 'qibing', 'nubing', 'xuanjia', 'shuijun'];

export const TROOPS: Record<TroopType, TroopDef> = {
    fubing:  { id: 'fubing',  name: '府兵',  cost: 100, foodPerThousand: 5,  atk: 10, def: 10, speed: 1.0 },
    jingbing:{ id: 'jingbing',name: '精兵',  cost: 200, foodPerThousand: 7,  atk: 15, def: 12, speed: 1.0 },
    qibing:  { id: 'qibing',  name: '骑兵',  cost: 250, foodPerThousand: 10, atk: 14, def: 9,  speed: 2.0 },
    nubing:  { id: 'nubing',  name: '弩兵',  cost: 180, foodPerThousand: 6,  atk: 13, def: 7,  speed: 0.9 },
    xuanjia: { id: 'xuanjia', name: '玄甲军',cost: 800, foodPerThousand: 15, atk: 22, def: 18, speed: 1.8 },
    shuijun: { id: 'shuijun', name: '水军',  cost: 200, foodPerThousand: 8,  atk: 11, def: 10, speed: 1.0 }
};

// 克制矩阵：key 克制 value 中的兵种（攻击 +30%）
export const COUNTER: Record<TroopType, TroopType[]> = {
    fubing:  [],
    jingbing:['fubing'],
    qibing:  ['nubing', 'fubing'],
    nubing:  ['jingbing', 'fubing', 'xuanjia'],
    xuanjia: ['qibing', 'jingbing', 'fubing'],
    shuijun: []
};

export function troopName(t: TroopType): string {
    return TROOPS[t].name;
}

export function isCounter(att: TroopType, def: TroopType): boolean {
    return COUNTER[att].includes(def);
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run troops.test.ts`
Expected: PASS（3 用例）

## Task 2: 兵力账本与募兵（纯逻辑）

**Files:** Create `assets/scripts/core/Army.ts`、`assets/scripts/core/Military.ts`、`tests/military.test.ts`；Modify `assets/scripts/core/ResourceSystem.ts`、`assets/scripts/core/CityRegistry.ts`、三个既有测试的 makeCity

- [ ] **Step 1: 修改 `ResourceSystem.ts`：`CityState` 增加 `troops`**

```ts
import type { TroopType } from '../data/Troops';
// 在 CityState 中追加：
    troops: Record<TroopType, number>; // 各兵种兵力（与 army 同步）
```

- [ ] **Step 2: 修改 `CityRegistry.ts` 的 createCityStates 初始化 troops**

```ts
import { TROOP_ORDER } from '../data/Troops';
// map 内返回对象补充：
    troops: { fubing: c.tier === 1 ? 8000 : 4000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 },
```

- [ ] **Step 3: 修改三个既有测试的 makeCity：army 与 troops 保持一致**

```ts
// makeCity 改为（以 resource.test.ts 为例，其余两处同样处理）：
function makeCity(partial: Partial<CityState>): CityState {
    const merged = {
        id: 'c', name: '城', faction: 'tang', population: 10, food: 1000,
        gold: 100, army: 5000, defense: 5, morale: 80, generalId: null,
        facilities: { farm: 0, market: 0, barracks: 0, granary: 0 }, policyUsed: false,
        ...partial
    };
    return { ...merged, troops: { fubing: merged.army, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 } };
}
```

- [ ] **Step 4: 写失败测试 `tests/military.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { addTroops, removeArmy } from '../assets/scripts/core/Army';
import { recruit } from '../assets/scripts/core/Military';
import { TROOP_ORDER } from '../assets/scripts/data/Troops';
import { createCityStates } from '../assets/scripts/core/CityRegistry';

describe('Military 募兵与兵力账本', () => {
    it('募兵：扣金并增加对应兵种与总兵力', () => {
        const [c] = createCityStates();
        const before = c.army;
        const res = recruit(c, 'nubing', 2); // 2 千人
        expect(res.ok).toBe(true);
        expect(c.gold).toBeLessThan(600);
        expect(c.troops.nubing).toBe(2000);
        expect(c.army).toBe(before + 2000);
    });

    it('黄金不足被拒绝', () => {
        const [c] = createCityStates();
        c.gold = 100;
        const res = recruit(c, 'xuanjia', 1);
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('黄金不足');
    });

    it('removeArmy 从府兵开始扣减且不超总量', () => {
        const [c] = createCityStates();
        const removed = removeArmy(c, 3000);
        expect(removed).toBe(3000);
        expect(c.army).toBe(5000 - 3000);
        expect(c.troops.fubing).toBe(2000);
    });

    it('removeArmy 超量时清零', () => {
        const [c] = createCityStates();
        const removed = removeArmy(c, 99999);
        expect(c.army).toBe(0);
        expect(TROOP_ORDER.every((t) => c.troops[t] === 0)).toBe(true);
        expect(removed).toBe(5000);
    });

    it('addTroops 同步总兵力', () => {
        const [c] = createCityStates();
        addTroops(c, 'qibing', 1000);
        expect(c.troops.qibing).toBe(1000);
        expect(c.army).toBe(6000);
    });
});
```

- [ ] **Step 5: 创建 `assets/scripts/core/Army.ts`**

```ts
import type { CityState } from './ResourceSystem';
import { TROOP_ORDER, type TroopType } from '../data/Troops';

export function addTroops(city: CityState, type: TroopType, amount: number): void {
    city.troops[type] += amount;
    city.army += amount;
}

export function removeArmy(city: CityState, amount: number): number {
    const before = city.army;
    let remaining = Math.min(amount, before);
    for (const t of TROOP_ORDER) {
        if (remaining <= 0) {
            break;
        }
        const take = Math.min(city.troops[t], remaining);
        city.troops[t] -= take;
        remaining -= take;
    }
    city.army = TROOP_ORDER.reduce((s, t) => s + city.troops[t], 0);
    return before - city.army;
}
```

- [ ] **Step 6: 创建 `assets/scripts/core/Military.ts`**

```ts
import type { CityState } from './ResourceSystem';
import { TROOPS, type TroopType } from '../data/Troops';
import { addTroops } from './Army';
import type { ApplyResult } from './PolicySystem';

export function recruit(city: CityState, type: TroopType, thousands: number): ApplyResult {
    const def = TROOPS[type];
    const cost = Math.round(def.cost * thousands);
    if (city.gold < cost) {
        return { ok: false, reason: '黄金不足' };
    }
    city.gold -= cost;
    addTroops(city, type, Math.round(thousands * 1000));
    return { ok: true, reason: '' };
}
```

- [ ] **Step 7: 运行测试**

Run: `npx vitest run military.test.ts resource.test.ts policy.test.ts facility.test.ts`
Expected: PASS（原 21 用例不受影响 + 新增 5 用例）

## Task 3: 战争结算（纯逻辑）

**Files:** Create `assets/scripts/core/BattleSystem.ts`、`tests/battle.test.ts`

- [ ] **Step 1: 写失败测试 `tests/battle.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveBattle, type BattleArmy } from '../assets/scripts/core/BattleSystem';

// 胜掷 r 满足 r < attWinProb 则攻方胜：
//   低掷(0.05)≈强攻得手；高掷(0.95)≈守方得手；中掷(0.5)看概率。
const LOW_ROLL = () => 0.05;
const MID_ROLL = () => 0.5;
const HIGH_ROLL = () => 0.95;

function army(commander: number, troops: Record<string, number>): BattleArmy {
    return { generalCommand: commander, troops: troops as BattleArmy['troops'] };
}

describe('BattleSystem 战争结算', () => {
    it('实力悬殊：强攻胜', () => {
        const att = army(90, { fubing: 10000, qibing: 2000 });
        const def = army(40, { fubing: 3000 });
        const r = resolveBattle(att, def, { rng: LOW_ROLL });
        expect(r.attackerWin).toBe(true);
        expect(r.attackerLoss).toBeLessThan(12000);
        expect(r.defenderLoss).toBeLessThanOrEqual(3000);
    });

    it('城防加成可让守方获胜', () => {
        const att = army(60, { fubing: 8000 });
        const def = army(70, { fubing: 4000, nubing: 2000 });
        const r = resolveBattle(att, def, { cityDefense: 20, rng: HIGH_ROLL });
        expect(r.attackerWin).toBe(false);
    });

    it('江河惩罚可翻转战局（无水军渡江）', () => {
        const att = army(80, { fubing: 10000 });
        const def = army(60, { fubing: 8000 });
        const withPenalty = resolveBattle(att, def, { riverPenalty: 0.4, rng: MID_ROLL });
        const without = resolveBattle(att, def, { rng: MID_ROLL });
        expect(withPenalty.attackerWin).toBe(false);
        expect(without.attackerWin).toBe(true);
    });

    it('伤亡不超参战兵力', () => {
        const att = army(70, { qibing: 4000, nubing: 2000 });
        const def = army(70, { fubing: 6000, jingbing: 1000 });
        const r = resolveBattle(att, def, { rng: MID_ROLL });
        expect(r.attackerLoss).toBeLessThanOrEqual(6000);
        expect(r.defenderLoss).toBeLessThanOrEqual(7000);
        expect(r.report.length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: 创建 `assets/scripts/core/BattleSystem.ts`**

```ts
import { TROOP_ORDER, TROOPS, type TroopType, isCounter } from '../data/Troops';

export interface BattleArmy {
    generalCommand: number; // 0..100
    troops: Record<TroopType, number>;
}

export interface BattleOptions {
    cityDefense?: number;   // 城防加成（每点 +5% 守方战力）
    riverPenalty?: number;  // 渡江惩罚（0..1）
    rng?: () => number;     // 注入随机源，默认 Math.random
}

export interface BattleResult {
    attackerWin: boolean;
    attackerLoss: number;
    defenderLoss: number;
    report: string;
}

function totalOf(troops: Record<TroopType, number>): number {
    return TROOP_ORDER.reduce((s, t) => s + (troops[t] ?? 0), 0);
}

function powerOf(troops: Record<TroopType, number>, command: number, offense: boolean): number {
    let power = 0;
    for (const t of TROOP_ORDER) {
        const n = troops[t] ?? 0;
        if (n <= 0) {
            continue;
        }
        power += n * (offense ? TROOPS[t].atk : TROOPS[t].def);
    }
    return power * (1 + (command / 100) * 0.5);
}

function counterBonus(att: Record<TroopType, number>, def: Record<TroopType, number>): number {
    let bonus = 0;
    for (const at of TROOP_ORDER) {
        for (const dt of TROOP_ORDER) {
            if (isCounter(at, dt)) {
                bonus += Math.min(att[at] ?? 0, def[dt] ?? 0) * 0.3 * TROOPS[at].atk;
            }
        }
    }
    return bonus;
}

export function resolveBattle(att: BattleArmy, def: BattleArmy, opts: BattleOptions = {}): BattleResult {
    const rng = opts.rng ?? Math.random;
    const r = rng();
    const rand = 0.9 + r * 0.2; // 0.9..1.1
    const riverPenalty = opts.riverPenalty ?? 0;
    const cityBonus = (opts.cityDefense ?? 0) * 0.05;

    const attPower = powerOf(att.troops, att.generalCommand, true) * (1 - riverPenalty) + counterBonus(att.troops, def.troops);
    const defPower = powerOf(def.troops, def.generalCommand, false) * (1 + cityBonus);
    const attTotal = totalOf(att.troops);
    const defTotal = totalOf(def.troops);

    const attWinProb =
        attTotal <= 0 ? 0 :
        defTotal <= 0 ? 1 :
        attPower / (attPower + defPower);
    const attackerWin = r < attWinProb;

    const winnerPower = attackerWin ? attPower : defPower;
    const loserPower = attackerWin ? defPower : attPower;
    const ratio = Math.min(1, loserPower / Math.max(1, winnerPower));

    let attackerLoss: number;
    let defenderLoss: number;
    if (attackerWin) {
        attackerLoss = Math.round(attTotal * (0.1 + ratio * 0.2));
        defenderLoss = Math.round(defTotal * (0.3 + ratio * 0.5));
    } else {
        attackerLoss = Math.round(attTotal * (0.2 + ratio * 0.7));
        defenderLoss = Math.round(defTotal * (0.1 + ratio * 0.2));
    }

    const report = attackerWin
        ? `大破守军，斩获 ${defenderLoss}，自损 ${attackerLoss}`
        : `攻势受挫，损兵 ${attackerLoss}，敌损 ${defenderLoss}`;

    return { attackerWin, attackerLoss, defenderLoss, report };
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run battle.test.ts`
Expected: PASS（4 用例）。若「城防获胜」「江河翻转」用例因固定 rng=1 不符，可微调常数（如城防加成/江河惩罚幅度）使断言成立，再回测全量。

## Task 4: 行军系统（纯逻辑）

**Files:** Create `assets/scripts/core/MarchSystem.ts`、`tests/march.test.ts`

- [ ] **Step 1: 写失败测试 `tests/march.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { marchTurns, createMarch, tickMarch, dominantSpeed } from '../assets/scripts/core/MarchSystem';
import { getCity } from '../assets/scripts/data/Cities';

describe('MarchSystem 行军', () => {
    it('距离越远回合越多；骑兵更快', () => {
        const from = getCity('taiyuan');
        const to = getCity('changan');
        const foot = marchTurns(from, to, 1.0);
        const horse = marchTurns(from, to, 2.0);
        expect(foot).toBeGreaterThan(horse);
        expect(foot).toBeGreaterThanOrEqual(1);
    });

    it('创建行军订单后每回合推进，到达返回 true', () => {
        const order = createMarch('m1', getCity('taiyuan'), getCity('changan'), { fubing: 1000, qibing: 0, jingbing: 0, nubing: 0, xuanjia: 0, shuijun: 0 });
        while (!tickMarch(order)) { /* 推进 */ }
        expect(order.turnsLeft).toBe(0);
    });

    it('主导兵种决定行军速度（骑兵多则更快）', () => {
        const fast = dominantSpeed({ fubing: 0, qibing: 1000, jingbing: 0, nubing: 0, xuanjia: 0, shuijun: 0 });
        const slow = dominantSpeed({ fubing: 1000, qibing: 0, jingbing: 0, nubing: 0, xuanjia: 0, shuijun: 0 });
        expect(fast).toBeGreaterThan(slow);
    });
});
```

- [ ] **Step 2: 创建 `assets/scripts/core/MarchSystem.ts`**

```ts
import { TROOP_ORDER, TROOPS, type TroopType } from '../data/Troops';
import type { CityDef } from './Types';

export interface MarchOrder {
    id: string;
    fromId: string;
    toId: string;
    troops: Record<TroopType, number>;
    turnsLeft: number;
    speed: number;
}

export function dominantSpeed(troops: Record<TroopType, number>): number {
    let total = 0;
    let weighted = 0;
    for (const t of TROOP_ORDER) {
        const n = troops[t] ?? 0;
        if (n > 0) {
            total += n;
            weighted += n * TROOPS[t].speed;
        }
    }
    return total === 0 ? 1 : weighted / total;
}

export function marchTurns(from: CityDef, to: CityDef, speed: number): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    return Math.max(1, Math.ceil(dist / (40 * speed)));
}

export function createMarch(id: string, from: CityDef, to: CityDef, troops: Record<TroopType, number>): MarchOrder {
    const speed = dominantSpeed(troops);
    return {
        id,
        fromId: from.id,
        toId: to.id,
        troops,
        turnsLeft: marchTurns(from, to, speed),
        speed
    };
}

export function tickMarch(order: MarchOrder): boolean {
    order.turnsLeft -= 1;
    return order.turnsLeft <= 0;
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run march.test.ts`
Expected: PASS（3 用例）

## Task 5: 募兵面板 UI（Cocos）

**Files:** Create `assets/scripts/ui/MilitaryPanel.ts`；Modify `assets/scripts/Bootstrap.ts`

- [ ] **Step 1: 创建 `assets/scripts/ui/MilitaryPanel.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import type { CityState } from '../core/ResourceSystem';
import { TROOP_ORDER, TROOPS } from '../data/Troops';
import { recruit } from '../core/Military';
import { findCity } from '../core/CityRegistry';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('MilitaryPanel')
export class MilitaryPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private titleLabel!: Label;
    private listRoot!: Node;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.build();
        bus.on('city-selected', (p) => { this.selectedId = p.cityId; this.refresh(); });
        bus.on('turn-advanced', () => this.refresh());
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 380);
        this.node.setPosition(0, -667 + 250, 2);
        this.titleLabel = this.makeLabel('军事 · 募兵', 38, InkTheme.darkText, 0, 140);
        this.listRoot = new Node('recruit-list');
        this.node.addChild(this.listRoot);
        this.refresh();
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(650, 44);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 6;
        l.color = color; l.useSystemFont = true;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return l;
    }

    private refresh(): void {
        const city = findCity(this.states, this.selectedId);
        if (!city) {
            return;
        }
        this.titleLabel.string = `${city.name} · 军事 · 金 ${city.gold} · 兵 ${city.army}`;
        this.listRoot.removeAllChildren();
        TROOP_ORDER.forEach((t, i) => {
            const def = TROOPS[t];
            const row = new Node(def.name);
            row.addComponent(UITransform).setContentSize(650, 52);
            row.setPosition(0, 80 - i * 58, 1);
            const label = row.addComponent(Label);
            label.string = `${def.name}（攻${def.atk}/防${def.def}/速${def.speed}）耗金${def.cost}/千 · 现有 ${city.troops[t]}`;
            label.fontSize = 21; label.lineHeight = 27; label.color = InkTheme.darkText;
            label.useSystemFont = true; label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                const r = recruit(city, t, 1);
                console.log(`[军事] 募${def.name}1千：${r.ok ? '成功' : r.reason}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}
```

- [ ] **Step 2: 修改 `assets/scripts/Bootstrap.ts`**：import 并装配 `MilitaryPanel`（与 GovernmentPanel 相同模式）。

- [ ] **Step 3: 编辑器预览验证**
Expected: 军事面板列出六兵种与当前兵力，点击招募 1 千扣金并加兵；金不足提示。

## Task 6: 全量验证与提交

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（原 21 + troops 3 + military 5 + battle 4 + march 3 = 36 用例）

- [ ] **Step 2: 提交**

```bash
git add assets tests docs
git commit -m "feat(m3): add six troop types, recruitment, march and battle resolution

- 六兵种数据与克制矩阵（府兵/精兵/骑兵/弩兵/玄甲军/水军）
- 兵力账本（addTroops/removeArmy）与募兵（recruit）
- 攻城/野战结算 resolveBattle（城防加成、江河惩罚、将领加成、兵种克制、注入 rng）
- 行军系统（距离×兵种速度计回合、行军订单推进）
- MilitaryPanel 募兵面板接入 Bootstrap
- 单测 36 用例全部通过"
```

## 自审记录

- **Spec 覆盖**：设计文档第 6 节（六兵种与克制闭环）、第 7 节（战争结算）；M2 引入的 `troops` 字段保持 `army` 同步，避免破坏既有结算。
- **占位符扫描**：无 TBD。
- **类型一致性**：`TroopType`、`BattleArmy`、`MarchOrder` 签名在 Task 1—5 一致；`resolveBattle` 的 `rng` 默认 `Math.random`，测试注入 `() => 1` 确定性。
