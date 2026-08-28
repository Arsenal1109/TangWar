# M5 AI 与事件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 加入群雄 AI（扩张 / 陈兵养锐）、历史事件链（入主长安 / 刘武周南下 / 王世充称帝）、胜利 / 失败与历史分支判定，并集成到回合推进。

**Architecture:** 新增引擎无关的 `WorldState` 承载运行态（城池 + 年月 + 标志 + 战报）；`core/AI.ts`（决策 / 应用分离）、`core/EventSystem.ts` + `data/HistoricalEvents.ts`（事件表 + once 触发）、`core/Victory.ts`（结局判定）、`core/TurnFlow.ts`（回合装配，可单测）；`ui/EventsPanel.ts` 渲染「天下大事」。沿用既有 `ApplyResult` 约定与 `rng` 可注入模式。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS，node + vitest）。

---

## 文件结构（M5）

```
assets/scripts/
├── core/
│   ├── WorldState.ts          # 新增：运行态容器 + 统计辅助
│   ├── AI.ts                  # 新增：群雄决策 / 应用
│   ├── EventSystem.ts         # 新增：历史事件检查
│   ├── Victory.ts             # 新增：胜负与结局判定
│   └── TurnFlow.ts            # 新增：回合装配（AI + 结算 + 事件 + 结局）
├── data/
│   └── HistoricalEvents.ts    # 新增：历史事件数据表
└── ui/
    └── EventsPanel.ts         # 新增：天下大事面板
tests/
├── event.test.ts              # 新增
├── ai.test.ts                 # 新增
├── victory.test.ts            # 新增
└── turnflow.test.ts           # 新增
```

## Task 1: 运行态 WorldState（纯逻辑）

**Files:** Create `assets/scripts/core/WorldState.ts`

- [ ] **Step 1: 创建 `assets/scripts/core/WorldState.ts`**

```ts
import type { CityState } from './ResourceSystem';

// 全局运行态：城池 + 年月 + 历史分支标志 + 每回合战报
export interface WorldState {
    year: number;
    seasonIndex: number;
    turn: number;
    cities: CityState[];
    flags: Record<string, boolean | number>; // 历史分支 / once 触发标志
    log: string[];
}

export function createWorld(year: number, cities: CityState[]): WorldState {
    return { year, seasonIndex: 2, turn: 0, cities, flags: {}, log: [] };
}

export function citiesOf(world: WorldState, faction: string): CityState[] {
    return world.cities.filter((c) => c.faction === faction);
}

export function countCities(world: WorldState, faction: string): number {
    return citiesOf(world, faction).length;
}

export function factionPower(world: WorldState, faction: string): number {
    return citiesOf(world, faction).reduce((s, c) => s + c.army, 0);
}
```

- [ ] **Step 2: 提交**

```bash
git add assets/scripts/core/WorldState.ts
git commit -m "feat(m5): add world running state container"
```

## Task 2: 历史事件链（纯逻辑）

**Files:** Create `assets/scripts/data/HistoricalEvents.ts`、`assets/scripts/core/EventSystem.ts`、`tests/event.test.ts`

- [ ] **Step 1: 写失败测试 `tests/event.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { checkHistoricalEvents } from '../assets/scripts/core/EventSystem';

function worldAt(year: number, mutate?: (id: string, faction: string) => void) {
    const w = createWorld(year, createCityStates());
    if (mutate) {
        w.cities.forEach((c) => mutate(c.id, c.faction));
    }
    return w;
}

describe('EventSystem 历史事件', () => {
    it('618 年唐据长安触发入主长安，武德称帝标志置位', () => {
        const w = worldAt(618);
        // 长安本就属 tang
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('入主长安');
        expect(r.messages.length).toBeGreaterThan(0);
        expect(w.flags['chengdi']).toBe(true);
        expect(w.flags['tang-enter-changan']).toBe(true);
    });

    it('历史事件只触发一次（once）', () => {
        const w = worldAt(618);
        checkHistoricalEvents(w);
        const again = checkHistoricalEvents(w);
        expect(again.names.filter((n) => n === '入主长安').length).toBe(0);
    });

    it('617 年未入主线：不触发称帝事件', () => {
        const w = worldAt(617);
        const r = checkHistoricalEvents(w);
        expect(r.names).not.toContain('入主长安');
        expect(w.flags['chengdi']).toBeUndefined();
    });

    it('619 年郑据洛阳触发王世充称帝', () => {
        const w = worldAt(619, (id, f) => { if (id === 'luoyang') { return 'zheng'; } return f; });
        const r = checkHistoricalEvents(w);
        expect(r.names).toContain('王世充称帝');
        expect(w.flags['zhengChengdi']).toBe(true);
    });
});
```

> 注：初始 `changan` 属 `tang`（现有 `CITIES` 数据），故 618 自动满足「唐据长安」。

- [ ] **Step 2: 运行测试，确认失败（EventSystem 未定义）**

Run: `npx vitest run event.test.ts`
Expected: FAIL（`checkHistoricalEvents` is not defined）

- [ ] **Step 3: 创建 `assets/scripts/data/HistoricalEvents.ts`**

```ts
import type { WorldState } from '../core/WorldState';

export interface WorldEventDef {
    id: string;
    name: string;
    message: string;
    condition: (w: WorldState) => boolean;
    run: (w: WorldState) => void; // 副作用（打标志 / 记数值）
}

export const HISTORICAL_EVENTS: WorldEventDef[] = [
    {
        id: 'tang-enter-changan',
        name: '入主长安',
        message: '李渊入主长安，代隋称帝（武德元年），隋唐易祚',
        condition: (w) => w.year === 618 && w.cities.some((c) => c.id === 'changan' && c.faction === 'tang'),
        run: (w) => { w.flags['chengdi'] = true; }
    },
    {
        id: 'sui-down',
        name: '隋室衰微',
        message: '宇文化及弑杨广于江都，隋亡于乱',
        condition: (w) => w.year === 618,
        run: () => { /* 史事记载 */ }
    },
    {
        id: 'liu-takes-jinyang',
        name: '刘武周南下',
        message: '刘武周举兵南下，攻陷晋阳，太原震动',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.id === 'jinyang' && c.faction === 'liu'),
        run: (w) => { w.flags['liuThreat'] = true; }
    },
    {
        id: 'wang-chengdi',
        name: '王世充称帝',
        message: '王世充据洛阳，僭号称郑帝',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.id === 'luoyang' && c.faction === 'zheng'),
        run: (w) => { w.flags['zhengChengdi'] = true; }
    }
];
```

- [ ] **Step 4: 创建 `assets/scripts/core/EventSystem.ts`**

```ts
import { HISTORICAL_EVENTS } from '../data/HistoricalEvents';
import type { WorldState } from './WorldState';

export interface HistoricalEventResult {
    names: string[];
    messages: string[];
}

export function checkHistoricalEvents(world: WorldState): HistoricalEventResult {
    const names: string[] = [];
    const messages: string[] = [];
    for (const ev of HISTORICAL_EVENTS) {
        if (world.flags[ev.id]) {
            continue; // 只触发一次
        }
        if (ev.condition(world)) {
            ev.run(world);
            world.flags[ev.id] = true;
            names.push(ev.name);
            const msg = `${ev.name}：${ev.message}`;
            messages.push(msg);
            world.log.push(msg);
        }
    }
    return { names, messages };
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `npx vitest run event.test.ts`
Expected: PASS（4 用例）

- [ ] **Step 6: 提交**

```bash
git add assets tests
git commit -m "feat(m5): add historical event chain with once-trigger flags"
```

## Task 3: 胜负与结局判定（纯逻辑）

**Files:** Create `assets/scripts/core/Victory.ts`、`tests/victory.test.ts`

- [ ] **Step 1: 写失败测试 `tests/victory.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { checkVictory } from '../assets/scripts/core/Victory';

describe('Victory 胜负判定', () => {
    it('唐无城池＝败亡结局', () => {
        const w = createWorld(620, createCityStates());
        w.cities.forEach((c) => { c.faction = 'sui'; });
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('defeat');
    });

    it('唐据全部城池＝一统天下（最佳结局）', () => {
        const w = createWorld(620, createCityStates());
        w.cities.forEach((c) => { c.faction = 'tang'; });
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('unify');
    });

    it('群雄并立：未结束', () => {
        const w = createWorld(620, createCityStates());
        const r = checkVictory(w);
        expect(r.finished).toBe(false);
    });

    it('626 年已称帝→武德主线（李世民贞观）', () => {
        const w = createWorld(626, createCityStates());
        w.flags['chengdi'] = true;
        w.cities[0].faction = 'tang';   // 至少保留一城，确保非败亡
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('reign');
    });

    it('626 年未入主长安→偏安支线', () => {
        const w = createWorld(626, createCityStates());
        w.flags['chengdi'] = false;
        w.cities[0].faction = 'tang';
        const r = checkVictory(w);
        expect(r.finished).toBe(true);
        expect(r.grade).toBe('decline');
    });
});
```

> 注：`createWorld(620, createCityStates())` 的城池 faction 初始即含多种势力，故「群雄并立」用例成立。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run victory.test.ts`
Expected: FAIL（`checkVictory` is not defined）

- [ ] **Step 3: 创建 `assets/scripts/core/Victory.ts`**

```ts
import type { WorldState } from './WorldState';
import { countCities } from './WorldState';
import { CITIES } from '../data/Cities';

export type EndingGrade = 'unify' | 'reign' | 'decline' | 'defeat';

export interface VictoryResult {
    finished: boolean;
    grade: EndingGrade;
    message: string;
}

export function checkVictory(world: WorldState): VictoryResult {
    const tang = countCities(world, 'tang');
    if (tang === 0) {
        return { finished: true, grade: 'defeat', message: '李唐灭国，天下易主' };
    }
    if (tang >= CITIES.length) {
        return { finished: true, grade: 'unify', message: '四海归一，李唐一统天下！' };
    }
    if (world.year >= 626) {
        if (world.flags['chengdi']) {
            return { finished: true, grade: 'reign', message: '武德九年，玄武门变，李世民即位，贞观之治' };
        }
        return { finished: true, grade: 'decline', message: '未能入主长安，唐室偏安一隅' };
    }
    return { finished: false, grade: 'decline', message: '' };
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run victory.test.ts`
Expected: PASS（5 用例）

- [ ] **Step 5: 提交**

```bash
git add assets tests
git commit -m "feat(m5): add victory/defeat and historical branch grading"
```

## Task 4: 群雄 AI（决策 / 应用分离）

**Files:** Create `assets/scripts/core/AI.ts`、`tests/ai.test.ts`

- [ ] **Step 1: 写失败测试 `tests/ai.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { decideFactions, applyAiActions } from '../assets/scripts/core/AI';

const LOW = () => 0.05;
const HIGH = () => 0.95;

// 只保留 tang + 一个 AI 势力，便于断言
function twoFactionWorld(ai: string): ReturnType<typeof createWorld> {
    const w = createWorld(620, createCityStates());
    w.cities.forEach((c) => { c.faction = (c.faction !== 'tang' && c.faction !== ai) ? '__empty__' : c.faction; });
    w.cities = w.cities.filter((c) => c.faction !== '__empty__');
    // 保证 AI 有一城、tang 有一城
    return w;
}

describe('AI 群雄决策', () => {
    it('不进兵（低随机压过低进取型概率）时吞噬最弱敌势一城', () => {
        const w = twoFactionWorld('qin'); // 秦·薛举＝aggressive 0.55
        const tangCity = w.cities.find((c) => c.faction === 'tang')!.id;
        const actions = decideFactions(w, LOW);
        applyAiActions(w, actions);
        // 秦低随机必走 expand，夺取 tang 最弱城
        expect(w.cities.some((c) => c.id === tangCity && c.faction !== 'tang')).toBe(true);
        expect(actions.some((a) => a.kind === 'expand')).toBe(true);
    });

    it('进取型 AI 从不替代玩家唐', () => {
        const w = twoFactionWorld('qin');
        const actions = decideFactions(w, LOW);
        expect(actions.every((a) => a.faction !== 'tang')).toBe(true);
    });

    it('陈兵养锐（reinforce）：消耗金并增府兵', () => {
        const w = twoFactionWorld('chu'); // 楚·萧铣＝defensive 0.15
        const aiCity = w.cities.find((c) => c.faction === 'chu')!;
        const before = aiCity.army;
        const goldBefore = aiCity.gold;
        aiCity.gold = Math.max(aiCity.gold, 1000);
        const actions = decideFactions(w, HIGH); // 高随机 >= 0.15 → reinforce
        applyAiActions(w, actions);
        expect(actions.some((a) => a.kind === 'reinforce')).toBe(true);
        expect(aiCity.army).toBeGreaterThanOrEqual(before);
        if (aiCity.gold < goldBefore) {
            expect(aiCity.troops.fubing).toBeGreaterThan(0);
        }
    });
});
```

> 注：`twoFactionWorld('qin')` 中 qin 唯一的敌势是 tang；AI 决策在「进取/扩张」概率压低（LOW）时必然 expand，取 tang 最弱城。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run ai.test.ts`
Expected: FAIL（`decideFactions` / `applyAiActions` not defined）

- [ ] **Step 3: 创建 `assets/scripts/core/AI.ts`**

```ts
import type { WorldState } from './WorldState';
import { factionPower } from './WorldState';
import { getFaction } from '../data/Factions';
import type { FactionPersonality } from './Types';

export type AiActionKind = 'expand' | 'reinforce';

export interface AiAction {
    faction: string;
    kind: AiActionKind;
    targetCityId?: string;
    detail: string;
}

// 各性格进取概率（决定扩张 vs 陈兵养锐）
const EXPAND_CHANCE: Record<FactionPersonality, number> = {
    aggressive: 0.55,
    expansionist: 0.45,
    scheming: 0.35,
    defensive: 0.15
};

export function decideFactions(world: WorldState, rng?: () => number): AiAction[] {
    const rand = rng ?? Math.random;
    const actions: AiAction[] = [];
    const factions = new Set<string>();
    for (const c of world.cities) {
        factions.add(c.faction);
    }
    for (const f of factions) {
        if (f === 'tang') {
            continue; // 玩家由人操控
        }
        const def = getFaction(f);
        if (factionPower(world, f) <= 0) {
            continue;
        }
        const charm = EXPAND_CHANCE[def.personality];
        const enemies = [...factions].filter((e) => e !== f);
        if (enemies.length === 0) {
            continue;
        }
        const weakest = enemies.reduce((a, b) =>
            factionPower(world, a) <= factionPower(world, b) ? a : b
        );
        const weakestCities = world.cities.filter((c) => c.faction === weakest);
        if (weakestCities.length === 0) {
            continue;
        }
        if (rand() < charm) {
            const target = [...weakestCities].sort((x, y) => x.defense - y.defense)[0];
            actions.push({ faction: f, kind: 'expand', targetCityId: target.id, detail: `${def.name}进攻${target.name}` });
        } else {
            actions.push({ faction: f, kind: 'reinforce', detail: `${def.name}陈兵养锐` });
        }
    }
    return actions;
}

export function applyAiActions(world: WorldState, actions: AiAction[]): void {
    for (const a of actions) {
        if (a.kind === 'expand' && a.targetCityId) {
            const city = world.cities.find((c) => c.id === a.targetCityId);
            if (city) {
                city.faction = a.faction;
                city.generalId = null;
                city.defense = Math.min(city.defense, 5);
                world.log.push(a.detail);
            }
        } else if (a.kind === 'reinforce') {
            for (const c of world.cities) {
                if (c.faction === a.faction && c.gold >= 200) {
                    c.gold -= 200;
                    c.troops.fubing += 500;
                    c.army += 500;
                    world.log.push(a.detail);
                    break; // 每势每回合至多一城养锐，避免金币被掏空
                }
            }
        }
    }
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run ai.test.ts`
Expected: PASS（3 用例）

- [ ] **Step 5: 提交**

```bash
git add assets tests
git commit -m "feat(m5): add faction AI decide/apply (expand or reinforce) by personality"
```

## Task 5: 回合装配 TurnFlow（纯逻辑）

**Files:** Create `assets/scripts/core/TurnFlow.ts`、`tests/turnflow.test.ts`

- [ ] **Step 1: 写失败测试 `tests/turnflow.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';

describe('TurnFlow 回合装配', () => {
    it('返回天下大事战报且未立即结束', () => {
        const w = createWorld(618, createCityStates());
        w.cities.forEach((c) => { c.faction = (c.faction === 'sui') ? 'tang' : c.faction; });
        const out = runWorldTurn(w, () => 0.05);
        expect(out).toBeTruthy();
        expect(out.log.length).toBeGreaterThan(0);
        expect(out.victory).toBeNull();
    });

    it('AI 扩张已应用到城池归属', () => {
        const w = createWorld(619, createCityStates());
        // 压低唐兵力使其成为最弱势力，AI 低随机必然向唐扩张
        w.cities.filter((c) => c.faction === 'tang').forEach((c) => { c.army = 1000; });
        const beforeTang = w.cities.filter((c) => c.faction === 'tang').length;
        runWorldTurn(w, () => 0.05); // 低随机 → 进取型 AI 扩张
        const afterTang = w.cities.filter((c) => c.faction === 'tang').length;
        expect(afterTang).toBeLessThan(beforeTang);
    });

    it('回合战报在每次结算后被清空重建', () => {
        const w = createWorld(618, createCityStates());
        runWorldTurn(w, () => 0.05);
        const first = w.log.length;
        expect(first).toBe(0); // runWorldTurn 结束已清空 log
    });
});
```

> 注：初始 `faction==='sui'` 的只有 `jiangdu`；将其归唐后唐至少有 4 城，AI（含隋以外势力）低随机扩张会削弱/吞噬敌城，从而减少唐城数，但大概率仍保有城池 → victory 为 null。

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run turnflow.test.ts`
Expected: FAIL（`runWorldTurn` not defined）

- [ ] **Step 3: 创建 `assets/scripts/core/TurnFlow.ts`**

```ts
import type { WorldState } from './WorldState';
import { resolveTurn } from './ResourceSystem';
import { decideFactions, applyAiActions } from './AI';
import { checkHistoricalEvents } from './EventSystem';
import { checkVictory, type VictoryResult } from './Victory';

export interface TurnOutcome {
    log: string[];
    eventNames: string[];
    victory: VictoryResult | null;
}

// 单回合装配：AI → 资源结算 → 历史事件 → 胜负判定，收集战报后清空 log
export function runWorldTurn(world: WorldState, rng?: () => number): TurnOutcome {
    const actions = decideFactions(world, rng);
    applyAiActions(world, actions);

    const res = resolveTurn(world.cities);
    for (const e of res.events) {
        world.log.push(e.message);
    }

    const ev = checkHistoricalEvents(world);

    const victory = checkVictory(world);

    const out: TurnOutcome = {
        log: [...world.log],
        eventNames: ev.names,
        victory: victory.finished ? victory : null
    };
    world.log = [];
    return out;
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run turnflow.test.ts`
Expected: PASS（3 用例）

- [ ] **Step 5: 提交**

```bash
git add assets tests
git commit -m "feat(m5): assemble world turn with AI, settlement, events and victory"
```

## Task 6: 天下大事面板 + Bootstrap 接线（Cocos）

**Files:** Create `assets/scripts/ui/EventsPanel.ts`；Modify `assets/scripts/Bootstrap.ts`

- [ ] **Step 1: 创建 `assets/scripts/ui/EventsPanel.ts`**

```ts
import { _decorator, Component, Node, Label, Color, UITransform } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';
import { InkTheme } from './InkTheme';

const { ccclass } = _decorator;

// 天下大事：回合结算后，在顶部下方推送战报 / 历史事件
@ccclass('EventsPanel')
export class EventsPanel extends Component {
    private bus!: EventBus<GameEvents>;
    private titleLabel!: Label;
    private bodyLabel!: Label;

    init(bus: EventBus<GameEvents>): this {
        this.bus = bus;
        this.build();
        this.bus.on('world-events', (p) => {
            this.titleLabel.string = p.title;
            this.bodyLabel.string = p.messages.join('\n');
            this.node.active = true;
        });
        return this;
    }

    private build(): void {
        this.node.addComponent(UITransform).setContentSize(710, 210);
        this.node.setPosition(0, 330, 3);
        const panel = this.node.addComponent(Label);
        panel.string = ''; panel.useSystemFont = true; panel.fontSize = 1;

        this.titleLabel = this.makeLabel('天下大事', 30, InkTheme.goldText, 0, 78);
        this.bodyLabel = this.makeLabel('', 20, InkTheme.darkText, 0, 30);
    }

    private makeLabel(text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node('label');
        n.addComponent(UITransform).setContentSize(670, 160);
        const l = n.addComponent(Label);
        l.string = text; l.fontSize = size; l.lineHeight = size + 8;
        l.color = color; l.useSystemFont = true; l.overflow = 2;
        n.setPosition(x, y, 1);
        this.node.addChild(n);
        return l;
    }
}
```

- [ ] **Step 2: 修改 `assets/scripts/Bootstrap.ts`**：import `createWorld`、`runWorldTurn`、`EventsPanel` 与 `WorldState`；新增 `world` 字段；`GameEvents` 增加 `'world-events'`；创建 `EventsPanel` 并接入 turn-advanced（推进前同步回合、结算、emit 天下大事、打印结局）。

```ts
import { EventsPanel } from './ui/EventsPanel';
import { createWorld, type WorldState } from './core/WorldState';
import { runWorldTurn } from './core/TurnFlow';
```

在 `GameEvents` 内新增：
```ts
    'world-events': { title: string; messages: string[] };
```

字段与装配（在 `buildUi` 与 turn-advanced 回调中）：
```ts
    private world!: WorldState;
    // onLoad: this.world = createWorld(this.turns.year, this.cityStates);
    // buildUi: ev events 节点 addComponent(EventsPanel).init(this.bus);
    // turn-advanced:
    //     this.world.year = this.turns.year;
    //     this.world.seasonIndex = this.turns.seasonIndex;
    //     const out = runWorldTurn(this.world);
    //     if (out.log.length || out.eventNames.length) {
    //         this.bus.emit('world-events', { title: `${this.turns.year} ${this.turns.getSeason()} 天下大事`, messages: out.log });
    //     }
    //     if (out.victory) {
    //         console.log(`[结局] ${out.victory.grade}：${out.victory.message}`);
    //     }
```

- [ ] **Step 3: 编辑器预览验证**
Expected: 推进回合后顶部下方弹出「天下大事」战报（AI 行动 / 缺粮 / 历史事件）；打印结局提示。

## Task 7: 全量验证与提交

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（50 + event 4 + victory 5 + ai 3 + turnflow 3 = 65 用例）

- [ ] **Step 2: 提交**

```bash
git add assets tests docs
git commit -m "feat(m5): add faction AI, historical event chain and victory grading
- AI：性格驱动的扩张/陈兵养锐决策与应用
- 历史事件：入主长安/隋室衰微/刘武周南下/王世充称帝（once）
- 胜负：败亡/一统/武德主线/偏安支线分级
- TurnFlow 回合装配 + EventsPanel 天下大事
- 单测 65 用例全部通过"
```

## 自审记录

- **Spec 覆盖**：设计文档第 8（AI 与历史事件）、第 9（胜利与结局）。
- **占位符扫描**：无 TBD；Step 3/4 各实现均已给出可运行代码。
- **类型一致性**：`WorldState` 被 `AI` / `EventSystem` / `Victory` / `TurnFlow` 复用；`TurnOutcome` 由 `runWorldTurn` 返回。`checkVictory` 复用既有 `countCities`。
- **分支语义**：`defeat` 为败亡结局；`reign` = 已入主长安的武德主线；`decline` = 未入主长安的弱势支线；`unify` = 一统。