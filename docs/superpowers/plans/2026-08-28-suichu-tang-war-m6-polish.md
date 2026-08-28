# M6 存档 / 音效打磨实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 加入**存档 / 读档**（纯逻辑序列化、版本守卫、往返一致性）、**自动存档**与**读档**接线，以及**音效管理器**（无资源时优雅降级占位）。

**Architecture:** `core/SaveSystem.ts` 引擎无关、可单测：`serializeSave(world)` → 纯 `SaveData`，`applySave(world, data)` → 原位回填城池引用（保证外部持有引用不变），带 `SAVE_VERSION` 守卫与 JSON 往返。`ui/SaveManager.ts`、`ui/SoundManager.ts`（Cocos）只做本地持久化（`sys.localStorage`）与回合/点击音效占位。沿用既有 `rng` 与纯函数约定。

**Tech Stack:** 同前（Cocos Creator 3.8 + TS，node + vitest）。平衡微调与 Android 打包属运行期/构建期，未纳入纯逻辑（见自审记录）。

---

## 文件结构（M6）

```
assets/scripts/
├── core/
│   └── SaveSystem.ts          # 新增：存档序列化 / 回填（纯逻辑）
└── ui/
    ├── SaveManager.ts         # 新增：本地持久化自动存档 + 读档
    └── SoundManager.ts        # 新增：回合/点击音效占位（可静音切换）
tests/
└── save.test.ts               # 新增
```

## Task 1: 存档系统（纯逻辑）

**Files:** Create `assets/scripts/core/SaveSystem.ts`、`tests/save.test.ts`

- [ ] **Step 1: 写失败测试 `tests/save.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { serializeSave, applySave, SAVE_VERSION } from '../assets/scripts/core/SaveSystem';

// 构造带差异的世界：改年份、改标志、改一座城归属
function armedWorld(): WorldState {
    const w = createWorld(619, createCityStates());
    w.turn = 7;
    w.flags['chengdi'] = true;
    w.flags['wang-chengdi'] = true;
    const c = w.cities.find((x) => x.id === 'luoyang')!;
    c.faction = 'zheng';
    c.morale = 33;
    c.gold = 1200;
    return w;
}

// 复制 JSON 往返
function jsonRoundTrip(data: ReturnType<typeof serializeSave>): ReturnType<typeof serializeSave> {
    return JSON.parse(JSON.stringify(data));
}

describe('SaveSystem 存档', () => {
    it('序列化后回填再序列化：字段往返一致（除 savedAt）', () => {
        const src = armedWorld();
        const d1 = serializeSave(src);
        const restored = createWorld(617, createCityStates());
        applySave(restored, jsonRoundTrip(d1));
        const d2 = serializeSave(restored);
        expect(d2.year).toBe(d1.year);
        expect(d2.seasonIndex).toBe(d1.seasonIndex);
        expect(d2.turn).toBe(d1.turn);
        expect(d2.flags).toEqual(d1.flags);
        expect(d2.cities).toEqual(d1.cities);
        expect(d2.meta.version).toBe(SAVE_VERSION);
    });

    it('applySave 原位回填，保持外层城池引用不变', () => {
        const src = armedWorld();
        const restored = createWorld(617, createCityStates());
        const cityRef = restored.cities.find((x) => x.id === 'luoyang')!;
        applySave(restored, jsonRoundTrip(serializeSave(src)));
        expect(restored.cities).toBeTruthy();
        // 引用同一对象：查得的仍是原位对象
        const again = restored.cities.find((x) => x.id === 'luoyang')!;
        expect(again).toBe(cityRef);
    });

    it('版本不兼容时抛出错误', () => {
        const src = armedWorld();
        const data = serializeSave(src) as { meta: { version: number } };
        data.meta.version = SAVE_VERSION + 1;
        const w = createWorld(617, createCityStates());
        expect(() => applySave(w, data as never)).toThrow(/版本/);
    });

    it('JSON 字符串可持久化并完整还原', () => {
        const src = armedWorld();
        const text = JSON.stringify(serializeSave(src));
        const restored = createWorld(617, createCityStates());
        applySave(restored, JSON.parse(text));
        expect(restored.year).toBe(619);
        expect(restored.cities.find((x) => x.id === 'luoyang')!.faction).toBe('zheng');
        expect(restored.flags['chengdi']).toBe(true);
    });
});
```

- [ ] **Step 2: 运行测试，确认失败（SaveSystem 未定义）**

Run: `npx vitest run save.test.ts`
Expected: FAIL（`serializeSave` / `applySave` not defined）

- [ ] **Step 3: 创建 `assets/scripts/core/SaveSystem.ts`**

```ts
import type { WorldState } from './WorldState';
import type { CityState } from './ResourceSystem';
import type { TroopType } from '../data/Troops';

export const SAVE_VERSION = 1;

export interface SaveCity {
    id: string;
    faction: string;
    population: number;
    food: number;
    gold: number;
    army: number;
    defense: number;
    morale: number;
    generalId: string | null;
    facilities: CityState['facilities'];
    troops: Record<TroopType, number>;
}

export interface SaveData {
    meta: { version: number; savedAt: string };
    year: number;
    seasonIndex: number;
    turn: number;
    flags: Record<string, boolean | number>;
    cities: SaveCity[];
}

export function serializeSave(world: WorldState): SaveData {
    return {
        meta: { version: SAVE_VERSION, savedAt: new Date().toISOString() },
        year: world.year,
        seasonIndex: world.seasonIndex,
        turn: world.turn,
        flags: { ...world.flags },
        cities: world.cities.map((c) => ({
            id: c.id,
            faction: c.faction,
            population: c.population,
            food: c.food,
            gold: c.gold,
            army: c.army,
            defense: c.defense,
            morale: c.morale,
            generalId: c.generalId,
            facilities: { ...c.facilities },
            troops: { ...c.troops }
        }))
    };
}

export function applySave(world: WorldState, data: SaveData): void {
    if (data.meta.version !== SAVE_VERSION) {
        throw new Error(`存档版本不兼容: ${data.meta.version}`);
    }
    world.year = data.year;
    world.seasonIndex = data.seasonIndex;
    world.turn = data.turn;
    world.flags = { ...data.flags };
    // 按城池 id 原位回填，保证外层持有引用不变
    for (const c of world.cities) {
        const sc = data.cities.find((s) => s.id === c.id);
        if (!sc) {
            continue;
        }
        c.faction = sc.faction;
        c.population = sc.population;
        c.food = sc.food;
        c.gold = sc.gold;
        c.army = sc.army;
        c.defense = sc.defense;
        c.morale = sc.morale;
        c.generalId = sc.generalId;
        c.facilities = { ...sc.facilities };
        c.troops = { ...sc.troops };
    }
    world.log = [];
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run save.test.ts`
Expected: PASS（4 用例）

- [ ] **Step 5: 提交**

```bash
git add assets tests
git commit -m "feat(m6): add versioned save serialize/apply with in-place restore"
```

## Task 2: 自动存档 / 读档 + 音效接线（Cocos）

**Files:** Create `assets/scripts/ui/SaveManager.ts`、`assets/scripts/ui/SoundManager.ts`；Modify `assets/scripts/Bootstrap.ts`

> `sys.localStorage` 来自 'cc'。存档键 `tangwar_save_v1`。

- [ ] **Step 1: 创建 `assets/scripts/ui/SaveManager.ts`**

```ts
import { _decorator, Component, sys } from 'cc';
import type { WorldState } from '../core/WorldState';
import { serializeSave, applySave } from '../core/SaveSystem';

const { ccclass } = _decorator;

const SAVE_KEY = 'tangwar_save_v1';

// 自动存档 / 读档：引擎侧持久化桥接
@ccclass('SaveManager')
export class SaveManager extends Component {
    save(world: WorldState): void {
        const text = JSON.stringify(serializeSave(world));
        sys.localStorage.setItem(SAVE_KEY, text);
        console.log('[存档] 已保存');
    }

    hasSave(): boolean {
        return sys.localStorage.getItem(SAVE_KEY) != null;
    }

    load(world: WorldState): boolean {
        const text = sys.localStorage.getItem(SAVE_KEY);
        if (!text) {
            return false;
        }
        try {
            applySave(world, JSON.parse(text));
            console.log('[读档] 已恢复');
            return true;
        } catch (e) {
            console.error('[读档] 失败', e);
            return false;
        }
    }
}
```

- [ ] **Step 2: 创建 `assets/scripts/ui/SoundManager.ts`**

```ts
import { _decorator, Component } from 'cc';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../Bootstrap';

const { ccclass } = _decorator;

// 音效占位：无资源时仅打日志，可切换静音；后续替换为 AudioSource 播放
@ccclass('SoundManager')
export class SoundManager extends Component {
    private enabled = true;

    init(bus: EventBus<GameEvents>): this {
        bus.on('turn-advanced', () => this.play('回合推进'));
        bus.on('city-selected', () => this.play('点选城池'));
        return this;
    }

    toggle(): boolean {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    private play(name: string): void {
        if (!this.enabled) {
            return;
        }
        // 占位：M6 打磨期替换为 AudioSource 播放命名音效
        console.log(`[音效] ${name}`);
    }
}
```

- [ ] **Step 3: 修改 `assets/scripts/Bootstrap.ts`**：装配 `SaveManager`、`SoundManager`；回合推进时自动存档。

```ts
import { SaveManager } from './ui/SaveManager';
import { SoundManager } from './ui/SoundManager';
```

`buildUi` 内新增（在 EventsPanel 之后）：
```ts
        // 音效（占位）与自动存档
        this.node.addComponent(SoundManager).init(this.bus);
        this.saveMgr = this.node.addComponent(SaveManager);
```
新增字段：
```ts
    private saveMgr!: SaveManager;
```
在 `turn-advanced` 回调末尾（结局打印之后）调用自动存档：
```ts
            this.saveMgr.save(this.world);
```

- [ ] **Step 4: 编辑器预览验证**
Expected: 推进回合后控制台打印「[音效] 回合推进」「[存档] 已保存」；重载场景后调用 `SaveManager.load` 可恢复回合数。

## Task 3: 全量验证与提交

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（65 + save 4 = 69 用例）

- [ ] **Step 2: 提交**

```bash
git add assets tests docs
git commit -m "feat(m6): add save/load system, autosave and sound manager placeholder
- SaveSystem: 版本守卫 + 序列化/原位回填 + JSON 往返一致
- 自动存档（回合推进时写入本地）+ 读档桥接
- SoundManager: 回合/点击音效占位（可静音）
- 单测 69 用例全部通过"
```

## 自审记录

- **Spec 覆盖**：设计文档第 12（存档：本地 JSON）、第 13 M6（存档；音效占位）。
- **占位符扫描**：无 TBD；实现可直接并入。音效播放留 `// 占位` 注释，因需美术/音频资源，先以空实现跑通流程。
- **范围界定**：**平衡调整**依赖实机游玩数据，暂不改动既有常量；**Android 打包**属 Creator 构建配置（非代码），本计划未纳入，需在编辑器内完成导出设置。二者已在目标阶段实现记录为后续项。
- **类型一致性**：`SaveCity` 复用 `CityState['facilities']`；`applySave` 保持 `world.cities` 数组引用不变、逐城回填，避免外部引用失效。