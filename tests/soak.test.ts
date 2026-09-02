import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { applyDifficultyStart, type DifficultyId } from '../assets/scripts/core/Difficulty';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { executeCouncilOrder, raidOdds } from '../assets/scripts/core/CommandSystem';
import { recruit } from '../assets/scripts/core/Military';
import { checkVictory } from '../assets/scripts/core/Victory';
import { FACTIONS } from '../assets/scripts/data/Factions';
import { ACHIEVEMENTS } from '../assets/scripts/core/Achievements';

/** 确定性随机源（mulberry32，与平衡模拟器同构） */
function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const factionIds = new Set(FACTIONS.map((f) => f.id).concat('none'));

interface SoakResult {
    games: number;
    turns: number;
    grades: Record<string, number>;
    achievementGames: Record<string, number>;
    errors: string[];
}

/** 一局贪心推演，逐回合做不变量巡检；发现违例即入 errors 并中止本局 */
function soakGame(seed: number, difficulty: DifficultyId, errors: string[], achGames: Record<string, number>): { turns: number; grade: string } {
    const rng = mulberry32(seed);
    const world = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
    world.difficulty = difficulty;
    applyDifficultyStart(world, difficulty);
    let grade = 'timeout';
    let turn = 0;
    for (; turn < 120; turn++) {
        // 募兵：金富粮足时补充府兵（人类玩家的基础操作，令模拟更接近真实胜场曲线）
        const home = world.cities.find((c) => c.id === 'taiyuan')!;
        if (home.gold > 1200 && home.troops.fubing < 8000) {
            recruit(home, 'fubing', 2);
        }
        const odds = raidOdds(world, 'taiyuan');
        const key = odds >= 55 ? 'raid' : (world.cities.find((c) => c.id === 'taiyuan')!.morale < 60 ? 'pacify' : 'defend');
        executeCouncilOrder(world, key as 'raid' | 'pacify' | 'defend', 'taiyuan', rng);
        world.turn += 1;
        world.seasonIndex = world.turn % 4;
        world.year = 617 + Math.floor(world.turn / 4);
        runWorldTurn(world, rng);
        // —— 不变量巡检 ——
        for (const c of world.cities) {
            const label = `${difficulty}/${seed}/t${turn}/${c.id}`;
            if (!Number.isFinite(c.gold) || !Number.isFinite(c.food) || !Number.isFinite(c.army) || !Number.isFinite(c.population)) {
                errors.push(`${label} 数值溢出`);
            }
            if (c.gold < 0 || c.food < 0 || c.army < 0) errors.push(`${label} 负资源`);
            if (c.morale < 0 || c.morale > 100) errors.push(`${label} 民心越界 ${c.morale}`);
            if (c.population <= 0) errors.push(`${label} 人口归零 ${c.population}`);
            if (!factionIds.has(c.faction)) errors.push(`${label} 未知阵营 ${c.faction}`);
            if (c.generalId !== null && !world.generals.some((g) => g.id === c.generalId)) {
                errors.push(`${label} 守将 ${c.generalId} 已不在武将名单`);
            }
            for (const n of Object.values(c.troops)) {
                if (!Number.isFinite(n) || n < 0) errors.push(`${label} 兵种数量异常`);
            }
        }
        const seen = new Set<string>();
        for (const g of world.generals) {
            if (seen.has(g.id)) errors.push(`${difficulty}/${seed}/t${turn} 武将重复 ${g.id}`);
            seen.add(g.id);
            if (g.loyalty < 1 || g.loyalty > 100) errors.push(`${difficulty}/${seed}/t${turn}/${g.id} 忠诚越界 ${g.loyalty}`);
            if (!factionIds.has(g.faction)) errors.push(`${difficulty}/${seed}/t${turn}/${g.id} 未知阵营 ${g.faction}`);
        }
        for (const [cityId, gid] of Object.entries(world.duyuns ?? {})) {
            if (!world.cities.some((c) => c.id === cityId && c.faction === 'tang')) {
                errors.push(`${difficulty}/${seed}/t${turn} 都督城 ${cityId} 非唐土`);
            }
        }
        const uniq = new Set(world.achievements);
        if (uniq.size !== world.achievements.length) errors.push(`${difficulty}/${seed}/t${turn} 成就重复解锁`);
        for (const id of world.achievements) {
            if (!ACHIEVEMENTS.some((a) => a.id === id)) errors.push(`${difficulty}/${seed}/t${turn} 未知成就 ${id}`);
        }
        const v = checkVictory(world);
        if (v.finished) {
            grade = v.grade;
            break;
        }
    }
    // 按局统计已解锁成就（成就一经解锁不回退，局末统计即等价）
    for (const id of world.achievements) {
        achGames[id] = (achGames[id] ?? 0) + 1;
    }
    return { turns: turn, grade };
}

describe('发行 soak（批量推演 + 不变量巡检）', () => {
    it('三难度 120 局：全程无不变量违例，征服线成就可达', () => {
        const errors: string[] = [];
        const achGames: Record<string, number> = {};
        const grades: Record<string, number> = {};
        const difficulties: DifficultyId[] = ['easy', 'normal', 'hard'];
        let games = 0;
        let turns = 0;
        for (const difficulty of difficulties) {
            for (let i = 0; i < 40; i++) {
                const seed = 100000 + i * 7919 + difficulties.indexOf(difficulty) * 13;
                const r = soakGame(seed, difficulty, errors, achGames);
                games += 1;
                turns += r.turns;
                grades[r.grade] = (grades[r.grade] ?? 0) + 1;
            }
        }
        // 巡检结论：任何违例都直接失败并输出样本
        expect(errors, `不变量违例 ${errors.length} 例，首例：${errors[0] ?? ''}`).toHaveLength(0);
        // 模拟覆盖：120 局 × 至多 120 回合
        expect(games).toBe(120);
        expect(turns).toBeGreaterThan(3000);
        // 征服/经济线成就必须在批量推演中自然出现过（M10.1 起机器人会募兵，
        // veteran-army 亦纳入必达清单；名将如云需 16 将，120 局仅偶现不作断言）。
        const mustFire = ['first-victory', 'city-taker', 'veteran-army', 'gold-hoard', 'full-treasury', 'granary', 'blitz'];
        const fired = mustFire.filter((id) => (achGames[id] ?? 0) > 0);
        expect(fired, `征服线成就未自然达成：${mustFire.filter((id) => !fired.includes(id)).join('、')}`).toEqual(mustFire);
        // 汇总输出（供调参参考）
        console.log('[soak] grades:', JSON.stringify(grades));
        console.log('[soak] 成就自然解锁局数:', JSON.stringify(achGames));
    }, 300000);
});
