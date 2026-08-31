# M4 将领 / 外交 / 谋略实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。
>
> **状态：✅ 已完成（2026-08-31 文档同步）** — 全部任务已实施并合入 main（`6e4dd60`）；外交 / 谋略 / 将领功能现由军帐主战屏「外交 / 计策」页承接（见 M7 记录）。

**Goal:** 加入将领任命与忠诚、势力外交关系与行动、谋略成功率结算（离间/计取/谣言），并配套两面板 UI。

**Architecture:** `core/GeneralSystem.ts`、`core/Diplomacy.ts`、`core/Stratagem.ts` 引擎无关、可单测（rng 可注入）；`ui/GeneralsPanel.ts`、`ui/DiplomacyPanel.ts` 只渲染与调用。沿用既有 `ApplyResult` 约定。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS，node + vitest）。

---

## 文件结构（M4）

```
assets/scripts/
├── core/
│   ├── GeneralSystem.ts        # 新增：将领运行时状态、任命、忠诚
│   ├── Diplomacy.ts            # 新增：势力关系 + 外交行动
│   └── Stratagem.ts            # 新增：离间/计取/谣言
└── ui/
    ├── GeneralsPanel.ts        # 新增：将领面板（任命/数据）
    └── DiplomacyPanel.ts       # 新增：外交面板
tests/
├── generals.test.ts            # 新增
├── diplomacy.test.ts           # 新增
└── stratagem.test.ts           # 新增
```

## Task 1: 将领系统（纯逻辑）

**Files:** Create `assets/scripts/core/GeneralSystem.ts`、`tests/generals.test.ts`

- [x] **Step 1: 写失败测试 `tests/generals.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createGeneralStates, assignGeneral, unassignGeneral, changeLoyalty, getGeneralState } from '../assets/scripts/core/GeneralSystem';

describe('GeneralSystem 将领', () => {
    it('初始化 12 位李唐将领且都有五维', () => {
        const gs = createGeneralStates();
        expect(gs.length).toBe(12);
        expect(gs.every((g) => g.stats.command >= 1 && g.stats.command <= 100)).toBe(true);
        expect(gs.every((g) => g.assignment === null)).toBe(true);
    });

    it('任命守将后不可重复任命他职', () => {
        const gs = createGeneralStates();
        const r = assignGeneral(gs[0], 'taiyuan', 'governor');
        expect(r.ok).toBe(true);
        expect(gs[0].assignment).toEqual({ role: 'governor', cityId: 'taiyuan' });
        const r2 = assignGeneral(gs[0], 'jinyang', 'commander');
        expect(r2.ok).toBe(false);
    });

    it('解除任命恢复可用', () => {
        const gs = createGeneralStates();
        assignGeneral(gs[0], 'taiyuan', 'governor');
        unassignGeneral(gs[0]);
        expect(gs[0].assignment).toBeNull();
    });

    it('忠诚增减被限制在 1..100', () => {
        const gs = createGeneralStates();
        changeLoyalty(gs[0], -200);
        expect(gs[0].loyalty).toBe(1);
        changeLoyalty(gs[0], 200);
        expect(gs[0].loyalty).toBe(100);
    });

    it('getGeneralState 按 id 取回', () => {
        const gs = createGeneralStates();
        expect(getGeneralState(gs, 'lishimin').name).toBe('李世民');
    });
});
```

- [x] **Step 2: 创建 `assets/scripts/core/GeneralSystem.ts`**

```ts
import { GENERALS } from '../data/Generals';
import type { GeneralStats } from './Types';
import type { ApplyResult } from './PolicySystem';

export type GeneralRole = 'governor' | 'commander';

export interface GeneralAssignment {
    role: GeneralRole;
    cityId: string;
}

export interface GeneralState {
    id: string;
    name: string;
    title: string;
    faction: string;
    stats: GeneralStats;
    loyalty: number;
    assignment: GeneralAssignment | null;
}

export function createGeneralStates(): GeneralState[] {
    return GENERALS.map((g) => ({
        id: g.id,
        name: g.name,
        title: g.title,
        faction: g.faction,
        stats: { ...g.stats },
        loyalty: g.loyalty,
        assignment: null
    }));
}

export function getGeneralState(states: GeneralState[], id: string): GeneralState {
    const g = states.find((item) => item.id === id);
    if (!g) {
        throw new Error(`未知将领: ${id}`);
    }
    return g;
}

export function assignGeneral(g: GeneralState, cityId: string, role: GeneralRole): ApplyResult {
    if (g.assignment) {
        return { ok: false, reason: `${g.name}已有任命` };
    }
    g.assignment = { role, cityId };
    return { ok: true, reason: '' };
}

export function unassignGeneral(g: GeneralState): void {
    g.assignment = null;
}

export function changeLoyalty(g: GeneralState, delta: number): void {
    g.loyalty = Math.max(1, Math.min(100, g.loyalty + delta));
}
```

- [x] **Step 3: 运行测试**

Run: `npx vitest run generals.test.ts`
Expected: PASS（5 用例）

## Task 2: 外交系统（纯逻辑）

**Files:** Create `assets/scripts/core/Diplomacy.ts`、`tests/diplomacy.test.ts`

- [x] **Step 1: 写失败测试 `tests/diplomacy.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createDiplomacyState, performDiplo } from '../assets/scripts/core/Diplomacy';

const LOW = () => 0.05;
const HIGH = () => 0.95;

describe('Diplomacy 外交', () => {
    it('开局关系：隋 -60、定杨 -40、瓦岗 +20', () => {
        const d = createDiplomacyState('tang');
        expect(d.relations.sui).toBe(-60);
        expect(d.relations.liu).toBe(-40);
        expect(d.relations.wa).toBe(20);
    });

    it('关系良好时结盟成功并扣金', () => {
        const d = createDiplomacyState('tang');
        d.relations.wa = 50;
        const res = performDiplo(d, 'tang', 'wa', 'alliance', { gold: 500, prestige: 80, armyPower: 10000, rng: LOW });
        expect(res.ok).toBe(true);
        expect(res.goldCost).toBeGreaterThan(0);
        expect(d.relations.wa).toBeGreaterThan(50);
        expect(d.allies).toContain('wa');
    });

    it('关系恶劣时结盟失败', () => {
        const d = createDiplomacyState('tang');
        d.relations.wa = -80;
        const res = performDiplo(d, 'tang', 'wa', 'alliance', { gold: 500, prestige: 80, armyPower: 10000, rng: HIGH });
        expect(res.ok).toBe(false);
    });

    it('进贡必定提升关系', () => {
        const d = createDiplomacyState('tang');
        const before = d.relations.sui;
        const res = performDiplo(d, 'tang', 'sui', 'tribute', { gold: 500, prestige: 80, armyPower: 10000, rng: LOW });
        expect(res.ok).toBe(true);
        expect(d.relations.sui).toBeGreaterThan(before);
    });

    it('威胁敌势可提升关系外的敬畏（消耗金，成功则降其关系或得贡）', () => {
        const d = createDiplomacyState('tang');
        d.relations.liu = -40;
        const res = performDiplo(d, 'tang', 'liu', 'threaten', { gold: 0, prestige: 90, armyPower: 50000, rng: LOW });
        expect(res.ok).toBe(true);
    });
});
```

- [x] **Step 2: 创建 `assets/scripts/core/Diplomacy.ts`**

```ts
import { FACTIONS } from '../data/Factions';

export interface DiplomacyState {
    relations: Record<string, number>; // -100..100
    allies: string[];
    atWar: string[];
}

export type DiploAction = 'alliance' | 'truce' | 'tribute' | 'marriage' | 'threaten';

export interface DiploCtx {
    gold: number;
    prestige: number;   // 0..100 威望
    armyPower: number;  // 兵力
    rng?: () => number;
}

export interface DiploResult {
    ok: boolean;
    reason: string;
    goldCost: number;
    relationsDelta: number;
    message: string;
}

function clampRel(v: number): number {
    return Math.max(-100, Math.min(100, v));
}

export function createDiplomacyState(playerFaction = 'tang'): DiplomacyState {
    const relations: Record<string, number> = {};
    for (const f of FACTIONS) {
        if (f.id !== playerFaction) {
            relations[f.id] = 0;
        }
    }
    relations.sui = -60;  // 隋室敌对
    relations.liu = -40;  // 刘武周交战
    relations.wa = 20;    // 瓦岗中立偏善
    relations.xia = 0;
    relations.zheng = 0;
    relations.chu = 0;
    relations.qin = 0;
    relations.liang = 0;
    relations.yan = 0;
    relations.wu = 0;
    relations.shen = 0;
    relations.lin = 0;
    return { relations, allies: [], atWar: ['sui', 'liu'] };
}

export function performDiplo(
    state: DiplomacyState,
    selfFaction: string,
    targetFaction: string,
    action: DiploAction,
    ctx: DiploCtx
): DiploResult {
    const rng = ctx.rng ?? Math.random;
    const r = rng();
    const rel = state.relations[targetFaction] ?? 0;
    const base = 0.5 + ctx.prestige / 200;

    switch (action) {
        case 'alliance': {
            if (ctx.gold < 200) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            const prob = Math.min(0.95, base + rel / 200);
            if (r < prob) {
                state.relations[targetFaction] = clampRel(rel + 20);
                if (!state.allies.includes(targetFaction)) {
                    state.allies.push(targetFaction);
                }
                return { ok: true, reason: '', goldCost: 200, relationsDelta: 20, message: `与 ${targetFaction} 结盟` };
            }
            return { ok: false, reason: '对方拒绝结盟', goldCost: 200, relationsDelta: -10, message: '结盟被拒，关系受挫' };
        }
        case 'truce': {
            if (ctx.gold < 100) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            const prob = Math.min(0.9, base + rel / 200);
            if (r < prob) {
                state.atWar = state.atWar.filter((f) => f !== targetFaction);
                state.relations[targetFaction] = clampRel(rel + 10);
                return { ok: true, reason: '', goldCost: 100, relationsDelta: 10, message: `与 ${targetFaction} 停战` };
            }
            return { ok: false, reason: '对方拒绝停战', goldCost: 100, relationsDelta: -5, message: '停战被拒' };
        }
        case 'tribute': {
            if (ctx.gold < 300) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            state.relations[targetFaction] = clampRel(rel + 30);
            return { ok: true, reason: '', goldCost: 300, relationsDelta: 30, message: `向 ${targetFaction} 进贡` };
        }
        case 'marriage': {
            if (ctx.gold < 500) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            if (ctx.prestige < 60) {
                return { ok: false, reason: '威望不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            state.relations[targetFaction] = clampRel(rel + 50);
            if (!state.allies.includes(targetFaction)) {
                state.allies.push(targetFaction);
            }
            return { ok: true, reason: '', goldCost: 500, relationsDelta: 50, message: `与 ${targetFaction} 和亲结盟` };
        }
        case 'threaten': {
            const prob = Math.min(0.95, 0.3 + ctx.armyPower / 100000 + ctx.prestige / 300);
            if (r < prob) {
                state.relations[targetFaction] = clampRel(rel - 20);
                return { ok: true, reason: '', goldCost: 0, relationsDelta: -20, message: `威慑 ${targetFaction}，其惧而降望` };
            }
            state.atWar.push(targetFaction);
            return { ok: false, reason: '对方不服，反致开战', goldCost: 0, relationsDelta: -30, message: `${targetFaction} 奋起反抗，两国交兵` };
        }
        default:
            return { ok: false, reason: '未知行动', goldCost: 0, relationsDelta: 0, message: '' };
    }
}
```

- [x] **Step 3: 运行测试**

Run: `npx vitest run diplomacy.test.ts`
Expected: PASS（5 用例）

## Task 3: 谋略系统（纯逻辑）

**Files:** Create `assets/scripts/core/Stratagem.ts`、`tests/stratagem.test.ts`

- [x] **Step 1: 写失败测试 `tests/stratagem.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { sowDiscord, bribeGeneral, spreadRumor } from '../assets/scripts/core/Stratagem';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';

const LOW = () => 0.05;
const HIGH = () => 0.95;

describe('Stratagem 谋略', () => {
    it('离间成功：敌将忠诚下降', () => {
        const [target] = createGeneralStates();
        const before = target.loyalty;
        const res = sowDiscord(target, 90, 200, LOW);
        expect(res.ok).toBe(true);
        expect(target.loyalty).toBeLessThan(before);
    });

    it('离间需耗金且金不足失败', () => {
        const [target] = createGeneralStates();
        const res = sowDiscord(target, 90, 50, HIGH);
        expect(res.ok).toBe(false);
    });

    it('计取敌将：耗金 + 谋略 + 威望决定成功', () => {
        const [target] = createGeneralStates();
        target.loyalty = 40;
        const res = bribeGeneral(target, 90, 80, 2000, LOW);
        expect(res.ok).toBe(true);
        expect(target.loyalty).toBeLessThan(40);
    });

    it('谣言成功：敌城民心下降', () => {
        const res = spreadRumor(80, 90, 200, LOW);
        expect(res.ok).toBe(true);
        expect(res.moraleDelta).toBeLessThan(0);
    });
});
```

- [x] **Step 2: 创建 `assets/scripts/core/Stratagem.ts`**

```ts
import type { GeneralState } from './GeneralSystem';
import type { ApplyResult } from './PolicySystem';

export interface StratagemResult extends ApplyResult {
    goldCost: number;
    loyaltyDelta?: number;
    moraleDelta?: number;
    message: string;
}

function clampLoyalty(v: number): number {
    return Math.max(1, Math.min(100, v));
}

export function sowDiscord(target: GeneralState, selfStrategy: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 100) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.3 + selfStrategy / 300 - target.loyalty / 200);
    if (roll < prob) {
        const delta = -15;
        target.loyalty = clampLoyalty(target.loyalty + delta);
        return { ok: true, reason: '', goldCost: 100, loyaltyDelta: delta, message: `离间成功，${target.name}忠诚下降` };
    }
    return { ok: false, reason: '离间被识破', goldCost: 100, message: '离间失败，事泄' };
}

export function bribeGeneral(target: GeneralState, selfStrategy: number, prestige: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 500) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.2 + gold / 5000 + selfStrategy / 250 + prestige / 200 - target.loyalty / 150);
    if (roll < prob) {
        const delta = -30;
        target.loyalty = clampLoyalty(target.loyalty + delta);
        return { ok: true, reason: '', goldCost: gold, loyaltyDelta: delta, message: `重金收买${target.name}，其心已动` };
    }
    return { ok: false, reason: '收买被拒', goldCost: gold, message: `${target.name}忠贞不贰，金银尽失` };
}

export function spreadRumor(targetMorale: number, selfStrategy: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 50) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.5 + selfStrategy / 300);
    if (roll < prob) {
        const delta = -6;
        return { ok: true, reason: '', goldCost: 50, moraleDelta: delta, message: '谣言四起，敌城民心动摇' };
    }
    return { ok: false, reason: '谣言被识破', goldCost: 50, message: '谣言未能惑众' };
}
```

> 注：`spreadRumor` 返回 `moraleDelta`，由调用方应用到目标城池 `morale`（纯函数不直接持有城池）。

- [x] **Step 3: 运行测试**

Run: `npx vitest run stratagem.test.ts`
Expected: PASS（4 用例）

## Task 4: 将领 / 外交面板 UI（Cocos）

**Files:** Create `assets/scripts/ui/GeneralsPanel.ts`、`assets/scripts/ui/DiplomacyPanel.ts`；Modify `assets/scripts/Bootstrap.ts`

- [x] **Step 1: 创建 `assets/scripts/ui/GeneralsPanel.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { createGeneralStates, assignGeneral, type GeneralState } from '../core/GeneralSystem';
import { findCity } from '../core/CityRegistry';
import type { CityState } from '../core/ResourceSystem';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('GeneralsPanel')
export class GeneralsPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private generals: GeneralState[] = [];
    private states: CityState[] = [];
    private selectedId = 'taiyuan';
    private listRoot!: Node;
    private titleLabel!: Label;

    init(bus: EventBus<GameEvents>, states: CityState[]): this {
        this.bus = bus;
        this.states = states;
        this.generals = createGeneralStates();
        this.build();
        bus.on('city-selected', (p) => { this.selectedId = p.cityId; this.refresh(); });
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 420);
        this.node.setPosition(0, -667 + 260, 2);
        this.titleLabel = this.makeLabel('将领', 38, InkTheme.darkText, 0, 170);
        this.listRoot = new Node('general-list');
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
        this.titleLabel.string = `将领 · 当前城 ${city ? city.name : ''}`;
        this.listRoot.removeAllChildren();
        this.generals.forEach((g, i) => {
            const s = g.stats;
            const row = new Node(g.name);
            row.addComponent(UITransform).setContentSize(650, 54);
            row.setPosition(0, 110 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${g.name}（${g.title}）统${s.command}/政${s.politics}/谋${s.strategy}/勇${s.valor}/威${s.prestige} 忠${g.loyalty} ${g.assignment ? `· 已任${g.assignment.role === 'governor' ? '守将' : '统军'}@${g.assignment.cityId}` : ''}`;
            label.fontSize = 20; label.lineHeight = 26; label.color = InkTheme.darkText;
            label.useSystemFont = true; label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                if (!city) { return; }
                const r = assignGeneral(g, city.id, 'governor');
                console.log(`[将领] 任命 ${g.name} 为 ${city.name} 守将：${r.ok ? '成功' : r.reason}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}
```

- [x] **Step 2: 创建 `assets/scripts/ui/DiplomacyPanel.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { createDiplomacyState, performDiplo, type DiplomacyState } from '../core/Diplomacy';
import { FACTIONS } from '../data/Factions';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

@ccclass('DiplomacyPanel')
export class DiplomacyPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private state!: DiplomacyState;
    private listRoot!: Node;
    private titleLabel!: Label;

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.state = createDiplomacyState('tang');
        this.build();
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(700, 420);
        this.node.setPosition(0, -667 + 260, 2);
        this.titleLabel = this.makeLabel('外交', 38, InkTheme.darkText, 0, 170);
        this.listRoot = new Node('diplo-list');
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
        this.titleLabel.string = '外交 · 大唐';
        this.listRoot.removeAllChildren();
        FACTIONS.filter((f) => f.id !== 'tang').forEach((f, i) => {
            const rel = this.state.relations[f.id] ?? 0;
            const row = new Node(f.name);
            row.addComponent(UITransform).setContentSize(650, 54);
            row.setPosition(0, 110 - i * 60, 1);
            const label = row.addComponent(Label);
            label.string = `${f.name} · 关系 ${rel} · 点触：进贡`;
            label.fontSize = 20; label.lineHeight = 26; label.color = InkTheme.darkText;
            label.useSystemFont = true; label.overflow = 3;
            row.on(Node.EventType.TOUCH_END, () => {
                const res = performDiplo(this.state, 'tang', f.id, 'tribute', { gold: 500, prestige: 80, armyPower: 30000 });
                console.log(`[外交] ${res.message}${res.ok ? '' : '（' + res.reason + '）'}`);
                this.refresh();
            });
            this.listRoot.addChild(row);
        });
    }
}
```

- [x] **Step 3: 修改 `assets/scripts/Bootstrap.ts`**：import 并装配 `GeneralsPanel`、`DiplomacyPanel`（与既有面板相同模式，均传入 `this.cityStates` / `this.bus`）。

- [x] **Step 4: 编辑器预览验证**
Expected: 将领面板列出 12 将（五维+忠诚），点触任命为当前城守将；外交面板列出 12 势力与关系，点触进贡提升关系（需金 500）。

## Task 5: 全量验证与提交

- [x] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（36 + generals 5 + diplomacy 5 + stratagem 4 = 50 用例）

- [x] **Step 2: 提交**

```bash
git add assets tests docs
git commit -m "feat(m4): add general assignment/loyalty, diplomacy relations and stratagems

- 将领运行时状态：五维 + 忠诚 + 任命（守将/统军）
- 外交：关系值、结盟/停战/进贡/和亲/威胁（rng 可注入）
- 谋略：离间/计取/谣言（成功率基于谋略、忠诚、威望、金银）
- GeneralsPanel / DiplomacyPanel 接入 Bootstrap
- 单测 50 用例全部通过"
```

## 自审记录

- **Spec 覆盖**：设计文档第 5.3（将领）、5.4（外交）、5.5（谋略）。
- **占位符扫描**：无 TBD。
- **类型一致性**：`GeneralState`、`DiplomacyState`、`DiploResult`、`StratagemResult` 签名在 Task 1—3 一致；`spreadRumor` 通过 `moraleDelta` 返回，避免直接持有城池。
