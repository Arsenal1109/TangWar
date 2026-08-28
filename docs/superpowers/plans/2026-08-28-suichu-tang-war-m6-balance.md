# M6 平衡初调实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development 或 executing-plans 逐任务执行。步骤用 `- [ ]` 跟踪。

**Goal:** 修复资源产出按 10 万人口取整导致的「小城零产出」失衡，改为按 1 万人口连续计产，使各人口规模城池都能正常产出金/粮，并避免郡县每季倒贴口粮。

**Architecture:** 纯逻辑调整 `core/ResourceSystem.ts` 的产出公式与常量，配以新增单测锁定「小城产出>0」「人口线性计产」「既有整数人口语义不变」，引擎无关、可单测。

**Tech Stack:** 同前（node + vitest）。

---

## 失衡定位

- 现行 [ResourceSystem.ts](file:///d:/Github/TangWar/assets/scripts/core/ResourceSystem.ts)：`foodGain = floor(pop / 10) * FOOD_PER_POP_10K * (1 + 0.2·farm)`；`goldGain = floor(pop / 10) * GOLD_PER_POP_10K * (...)`。
- 后果：人口 `8–9` 万（多数 tier-0 郡县）时 `floor(pop/10)=0`，金/粮产出恒为 `0`，而其 `4000` 军队每季还要耗粮 `20` → **净产出为负，郡县成纯负担**。
- 目标：产出按 1 万人口连续计算，人口单位即产出基数；`人口=10 万` 的既有语义（100 粮 / 40 金）不变。

## Task 1: 连续计产（纯逻辑）

**Files:** Modify `assets/scripts/core/ResourceSystem.ts:42-45,55-56`；Test `tests/resource.test.ts`

- [ ] **Step 1: 写失败测试 `tests/resource.test.ts`（新增 2 例）**

```ts
it('小城（人口 8）产出不为零', () => {
    const city = makeCity({ population: 8, food: 1000, gold: 100, army: 0 });
    const res = resolveTurn([city], 5);
    expect(res.deltas.gold).toBeGreaterThan(0);
    expect(res.deltas.food).toBeGreaterThan(0);
});

it('人口线性计粮：人口 11 产 110 粮', () => {
    const city = makeCity({ population: 11, food: 1000, army: 0 });
    const res = resolveTurn([city], 5);
    expect(res.deltas.food).toBe(Math.floor(11 * 10)); // 110
});
```

- [ ] **Step 2: 运行测试，确认失败（population 8 产出 0）**

Run: `npx vitest run resource.test.ts`
Expected: FAIL（新增 2 例失败，既有 3 例通过）

- [ ] **Step 3: 修改 `assets/scripts/core/ResourceSystem.ts`** 产出公式与常量

将
```ts
const FOOD_PER_POP_10K = 100;    // 每 1 万人口，每季产粮 100
const GOLD_PER_POP_10K = 40;     // 每 1 万人口，每季产金 40
```
改为
```ts
const FOOD_PER_POP = 10;     // 每 1 万人口，每季产粮 10（连续计，不再按 10 万取整）
const GOLD_PER_POP = 4;      // 每 1 万人口，每季产金 4
```
将
```ts
const foodGain = Math.floor(c.population / 10) * FOOD_PER_POP_10K * (1 + FACILITY_FOOD_BONUS * c.facilities.farm);
const goldGain = Math.floor(c.population / 10) * GOLD_PER_POP_10K * (1 + FACILITY_GOLD_BONUS * c.facilities.market);
```
改为
```ts
const foodGain = Math.floor(c.population * FOOD_PER_POP * (1 + FACILITY_FOOD_BONUS * c.facilities.farm));
const goldGain = Math.floor(c.population * GOLD_PER_POP * (1 + FACILITY_GOLD_BONUS * c.facilities.market));
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run resource.test.ts`
Expected: PASS（5 用例，含新增 2 例）

## Task 2: 全量验证与提交

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（69 + 2 = 71 用例）

- [ ] **Step 2: 提交**

```bash
git add assets tests docs
git commit -m "feat(m6): balance pass — linear resource yield for all city sizes
- 修复: 资源产出不再按 10 万人口取整，小城（人口 8~9）金/粮不再为零产出
- 郡县不再因军粮口粮成为纯负担；人口 10 万语义不变（100 粮 / 40 金）
- 新增 2 例单测锁定连续计产；共 71 用例全绿"
```

## 自审记录

- **Spec 覆盖**：设计文档第 5.1（内政：产出结算）与第 13 M6（平衡调整）。
- **占位符扫描**：无 TBD。
- **兼容性**：`population=10` 时新旧公式均为 `floor(10)=…=100 粮 / 40 金`，既有 3 例资源测试无需改动即保持通过；`population=0` 缺粮用例不受影响。
- **后续平衡项**（非本次，记录）：外交/谋略金耗与金产的配比、AI 养锐强度、战役伤亡系数，留待实机游玩后按数据微调。