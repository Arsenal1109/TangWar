import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { executeCouncilOrder, raidOdds } from '../assets/scripts/core/CommandSystem';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { recruitTalent, availableTalents } from '../assets/scripts/core/TalentSystem';
import { assignGeneral } from '../assets/scripts/core/GeneralSystem';
import { appointDuyun } from '../assets/scripts/core/GovernorSystem';
import { proclaimEmperor } from '../assets/scripts/core/ImperialSystem';
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

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

/** 推进若干回合：贪心突袭（复用模拟器策略） */
function playTurns(world: ReturnType<typeof freshWorld>, turns: number, rng: () => number) {
    for (let i = 0; i < turns; i++) {
        const odds = raidOdds(world, 'taiyuan');
        const key = odds >= 55 ? 'raid' : (world.cities.find((c) => c.id === 'taiyuan')!.morale < 60 ? 'pacify' : 'defend');
        const out = executeCouncilOrder(world, key as 'raid' | 'pacify' | 'defend', 'taiyuan', rng);
        if (!out.ok && key !== 'defend') {
            executeCouncilOrder(world, 'defend', 'taiyuan', rng);
        }
        world.turn += 1;
        world.seasonIndex = world.turn % 4;
        world.year = 618 + Math.floor(world.turn / 4);
        runWorldTurn(world, rng);
    }
}

/** 键序稳定的序列化（对象键递归排序），避免键序差异造成假阳性 */
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function snapshot(world: ReturnType<typeof freshWorld>) {
    return stableStringify({
        cities: world.cities,
        generals: world.generals,
        flags: world.flags,
        duyuns: world.duyuns ?? {},
        eraName: world.eraName ?? null,
        diplomacy: world.diplomacy,
        pacts: world.pacts,
        chronicle: world.chronicle,
        achievements: world.achievements,
        year: world.year,
        turn: world.turn,
        seasonIndex: world.seasonIndex
    });
}

describe('存档连续性（确定性回放）', () => {
    it('回合 N 存档读档后，同随机流续演与不中断完全一致', () => {
        // —— 主线：前 7 回合（埋入阵营变更/授职/都督/称帝）——
        const a = freshWorld();
        const seedA = mulberry32(424242);
        // 招募一名在野豪杰（改写阵营）
        a.cities.forEach((c) => {
            if (c.faction === 'tang') c.gold = 10000;
        });
        const talentId = availableTalents(a)[0]!.id;
        expect(recruitTalent(a, talentId).ok).toBe(true);
        // 授职 + 拜都督
        const g = a.generals.find((x) => x.id === talentId)!;
        assignGeneral(g, 'taiyuan', 'commander');
        expect(appointDuyun(a, 'taiyuan', talentId).ok).toBe(true);
        playTurns(a, 7, seedA);

        // —— 分叉：读档到新世界 ——
        const save = serializeSave(a, 5);
        const b = freshWorld();
        applySave(b, save);
        // 读档即一致
        expect(snapshot(b)).toBe(snapshot(a));
        // 同随机流续演 7 回合
        const seedB = mulberry32(777);
        const seedA2 = mulberry32(777);
        playTurns(b, 7, seedB);
        playTurns(a, 7, seedA2);
        expect(snapshot(b)).toBe(snapshot(a));
    });

    it('阵亡武将不复活：阵斩后存档读档，名单保持缺员', () => {
        const a = freshWorld();
        a.flags['kills'] = 1;
        const victim = a.generals.find((x) => x.id === 'liuwuzhou')!;
        a.generals = a.generals.filter((x) => x.id !== victim.id);
        const save = serializeSave(a, 5);
        const b = freshWorld();
        applySave(b, save);
        expect(b.generals.some((x) => x.id === 'liuwuzhou')).toBe(false);
    });
});

const LOW_RNG = () => 0.01;
