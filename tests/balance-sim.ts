/**
 * 平衡性蒙特卡洛模拟：纯核心层（引擎无关）回放整局游戏。
 * 策略：每回合执行最优军议（能夺城就突袭，否则安抚/防御择一），
 * 用真实 CommandSystem/马尔可夫 RNG 结算，统计结局分布与关键曲线。
 * 用法：cd tests && npx vite-node balance-sim.ts
 */
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { applyDifficultyStart, type DifficultyId } from '../assets/scripts/core/Difficulty';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { executeCouncilOrder, raidOdds } from '../assets/scripts/core/CommandSystem';
import { recruit } from '../assets/scripts/core/Military';
import { checkVictory } from '../assets/scripts/core/Victory';

interface SimResult {
    turns: number;
    grade: string;
    tangCitiesEnd: number;
    aiCapturesEnd: number;
    captures: string[];
    aiCaptures: string[];
    finalYear: number;
}

export function playGame(seed: number, difficulty: DifficultyId = "normal"): SimResult {
    let s = seed;
    const rng = (): number => {
        // mulberry32
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const world = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
    world.difficulty = difficulty;
    applyDifficultyStart(world, difficulty);
    const captures: string[] = [];
    const aiCaptures: string[] = [];
    let owned = new Set(world.cities.filter((c) => c.faction === 'tang').map((c) => c.id));
    for (let turn = 0; turn < 120; turn++) {
        // 简单策略：胜算≥55% 就突袭，士气低就安抚，否则防御；粮草不足降级为防御
        // 募兵：金富粮足时补充府兵（人类玩家的基础操作，令模拟更接近真实胜场曲线）
        const home = world.cities.find((c) => c.id === 'taiyuan')!;
        if (home.gold > 1200 && home.troops.fubing < 8000) {
            recruit(home, 'fubing', 2);
        }
        const odds = raidOdds(world, 'taiyuan');
        const key = odds >= 55 ? 'raid' : (world.cities.find((c) => c.id === 'taiyuan')!.morale < 60 ? 'pacify' : 'defend');
        const out = executeCouncilOrder(world, key as 'raid' | 'pacify' | 'defend', 'taiyuan', rng);
        if (!out.ok && key !== 'defend') {
            executeCouncilOrder(world, 'defend', 'taiyuan', rng);
        }
        // 对齐真实时序：UI turns.advance() → Bootstrap 同步 year/season/turn → runWorldTurn
        world.turn += 1;
        world.seasonIndex = world.turn % 4;
        world.year = 617 + Math.floor(world.turn / 4);
        runWorldTurn(world, rng);
        const now = new Set(world.cities.filter((c) => c.faction === 'tang').map((c) => c.id));
        for (const id of now) {
            if (!owned.has(id)) captures.push(id);
        }
        for (const id of owned) {
            if (!now.has(id)) aiCaptures.push(id);
        }
        owned = now;
        const v = checkVictory(world);
        if (v.finished) {
            return { turns: turn + 1, grade: v.grade, tangCitiesEnd: owned.size, aiCapturesEnd: aiCaptures.length, captures, aiCaptures, finalYear: world.year };
        }
    }
    return { turns: 120, grade: 'timeout', tangCitiesEnd: owned.size, aiCapturesEnd: aiCaptures.length, captures, aiCaptures, finalYear: world.year };
}

const difficulties: DifficultyId[] = ['easy', 'normal', 'hard'];
const N = 200;
for (const diff of difficulties) {
    const grades: Record<string, number> = {};
    let totalTurns = 0;
    let totalCaptures = 0;
    let totalAiCaptures = 0;
    let maxTangCities = 0;
    for (let i = 0; i < N; i++) {
        const r = playGame(1000 + i * 7919, diff);
        grades[r.grade] = (grades[r.grade] ?? 0) + 1;
        totalTurns += r.turns;
        totalCaptures += r.captures.length;
        totalAiCaptures += r.aiCaptures.length;
        maxTangCities = Math.max(maxTangCities, r.tangCitiesEnd);
    }
    const winRate = ((grades['unify'] ?? 0) + (grades['reign'] ?? 0)) / N * 100;
    const loseRate = ((grades['defeat'] ?? 0) + (grades['decline'] ?? 0)) / N * 100;
    console.log(`\n=== ${diff} · ${N} 局×120回合（贪心：胜算≥55% 即突袭） ===`);
    console.log('结局分布:', grades);
    console.log(`平均局长: ${(totalTurns / N).toFixed(1)} 回合  夺城 ${(totalCaptures / N).toFixed(2)}  失城 ${(totalAiCaptures / N).toFixed(2)}  峰值唐土 ${maxTangCities}/22`);
    console.log(`胜局率: ${winRate.toFixed(1)}%  负局率: ${loseRate.toFixed(1)}%`);
}
