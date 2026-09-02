import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { checkAchievements, ACHIEVEMENTS } from '../assets/scripts/core/Achievements';
import { executeCouncilOrder } from '../assets/scripts/core/CommandSystem';
import { persuadeSurrender, burnGranary, PERSUADE_COST, BURN_COST, PERSUADE_MORALE } from '../assets/scripts/core/Stratagem';
import type { WorldState } from '../assets/scripts/core/WorldState';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

/** 构造民心低落的邻境敌城 */
function wearyCity(world: WorldState, id: string, morale = 20) {
    const c = world.cities.find((x) => x.id === id)!;
    c.faction = 'wa';
    c.morale = morale;
    return c;
}

/** 令太原的唯一突袭目标为马邑：其余邻城（朔方/邺城/洛阳）皆归唐，排除 raidTarget 择弱偏移 */
function forceMayiTarget(world: WorldState) {
    for (const id of ['shuofang', 'ye', 'luoyang']) {
        const c = world.cities.find((x) => x.id === id)!;
        c.faction = 'tang';
    }
}

describe('劝降计', () => {
    it('民心未崩（≥45）不可劝', () => {
        const world = freshWorld();
        const c = wearyCity(world, 'xingyang', 60);
        const r = persuadeSurrender(world, c.id, c.faction, 90, 82, 1000, LOW);
        expect(r.ok).toBe(false);
        expect(r.goldCost).toBe(0);
        expect(r.reason).toContain('民心得固');
    });

    it('唐土不可劝；黄金不足不可劝', () => {
        const world = freshWorld();
        const c = wearyCity(world, 'xingyang', 20);
        const r1 = persuadeSurrender(world, 'taiyuan', 'tang', 90, 82, 1000, LOW);
        expect(r1.ok).toBe(false);
        expect(r1.reason).toContain('唐土');
        const r2 = persuadeSurrender(world, c.id, c.faction, 90, 82, 50, LOW);
        expect(r2.ok).toBe(false);
        expect(r2.reason).toContain('黄金不足');
    });

    it('成功：城池易主、民心归 55、关系 -25', () => {
        const world = freshWorld();
        const c = wearyCity(world, 'xingyang', 20);
        world.diplomacy.relations.wa = 30;
        const r = persuadeSurrender(world, c.id, c.faction, 90, 82, 1000, LOW);
        expect(r.ok).toBe(true);
        expect(r.cityDefected).toBe(true);
        expect(r.goldCost).toBe(PERSUADE_COST);
        expect(c.faction).toBe('tang');
        expect(c.morale).toBe(55);
        expect(world.diplomacy.relations.wa).toBe(5);
    });

    it('成功概率随民心低落而升：HIGH 下民心 44 亦难成，LOW 下必成', () => {
        const world = freshWorld();
        const c44 = wearyCity(world, 'xingyang', 44);
        const r44 = persuadeSurrender(world, c44.id, c44.faction, 90, 82, 1000, HIGH);
        expect(r44.ok).toBe(false); // (45-44)/80+90/400+82/350 ≈ 0.73 → HIGH 0.99 掷不中
        const c10 = wearyCity(world, 'ye', 10);
        const r10 = persuadeSurrender(world, c10.id, c10.faction, 90, 82, 1000, LOW);
        expect(r10.ok).toBe(true);
    });

    it('守将去向：归附则改旗忠诚 45，遁走则除名', () => {
        const world = freshWorld();
        const c = wearyCity(world, 'xingyang', 20);
        c.generalId = 'shanxiongxin'; // 瓦岗飞将
        const r1 = persuadeSurrender(world, c.id, c.faction, 90, 82, 1000, LOW); // 第二掷 0.01 < 0.7 归附
        expect(r1.generalJoined).toBe(true);
        const g1 = world.generals.find((g) => g.id === 'shanxiongxin')!;
        expect(g1.faction).toBe('tang');
        expect(g1.loyalty).toBe(45);
        // 第二次：遁走分支（0.75 ≥ 0.7）
        const c2 = wearyCity(world, 'pengcheng', 15);
        c2.generalId = 'xushiji';
        const seq = [0.01, 0.75]; // 劝降掷 + 守将去向掷
        let i = 0;
        const r2 = persuadeSurrender(world, c2.id, c2.faction, 90, 82, 1000, () => seq[i++ % seq.length]);
        expect(r2.generalJoined).toBe(false);
        expect(world.generals.some((g) => g.id === 'xushiji')).toBe(false);
        expect(c2.generalId).toBeNull();
    });

    it('失败：守军戒备（民心 +5）、关系 -10、耗金照付', () => {
        const world = freshWorld();
        const c = wearyCity(world, 'xingyang', 40);
        world.diplomacy.relations.wa = 0;
        const r = persuadeSurrender(world, c.id, c.faction, 50, 40, 1000, HIGH);
        expect(r.ok).toBe(false);
        expect(r.goldCost).toBe(PERSUADE_COST);
        expect(c.morale).toBe(45);
        expect(world.diplomacy.relations.wa).toBe(-10);
        expect(c.faction).toBe('wa');
    });
});

describe('劫粮焚仓', () => {
    it('黄金不足不可焚', () => {
        const r = burnGranary({ food: 3000, morale: 70, generalId: null }, 5, 90, 50, LOW);
        expect(r.ok).toBe(false);
        expect(r.reason).toContain('黄金不足');
    });

    it('成功：粮草折三成、民心 -5', () => {
        const target = { food: 3000, morale: 70, generalId: null };
        const r = burnGranary(target, 0, 90, 1000, LOW);
        expect(r.ok).toBe(true);
        expect(r.goldCost).toBe(BURN_COST);
        expect(target.food).toBe(2100);
        expect(target.morale).toBe(65);
        expect(r.message).toContain('900');
    });

    it('城防愈高愈难得手：defense 12 时 HIGH 必败', () => {
        const target = { food: 3000, morale: 70, generalId: null };
        const r = burnGranary(target, 12, 50, 1000, HIGH);
        expect(r.ok).toBe(false); // 0.3+50/300-12/60 ≈ 0.27 → HIGH 掷不中
        expect(target.food).toBe(3000);
    });
});

describe('破城守将命运', () => {
    function raidReadyWorld() {
        const world = freshWorld();
        forceMayiTarget(world); // 朔方归唐：太原突袭目标锁定马邑
        const mayi = world.cities.find((c) => c.id === 'mayi')!;
        mayi.generalId = 'songjingang'; // 宋金刚守马邑
        mayi.army = 0;
        for (const t of Object.keys(mayi.troops) as Array<keyof typeof mayi.troops>) {
            mayi.troops[t] = 0;
        }
        mayi.defense = 0;
        return { world, mayi };
    }

    it('破城：序列 [胜 0.01, 不斩 0.5, 被俘 0.01] → 宋金刚被俘归唐（忠诚 40）', () => {
        const { world, mayi } = raidReadyWorld();
        const seq = [0.01, 0.5, 0.01]; // 胜掷 → 阵斩掷（≥0.12 免斩）→ 俘将掷（<0.6 归唐）
        let i = 0;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(out.ok).toBe(true);
        expect(mayi.faction).toBe('tang');
        const g = world.generals.find((x) => x.id === 'songjingang');
        expect(g?.faction).toBe('tang');
        expect(g?.loyalty).toBe(40);
        expect(mayi.generalId).toBeNull();
        expect(world.flags['kills']).toBeUndefined();
    });

    it('破城：俘将掷 ≥ 0.6 → 守将遁走离场', () => {
        const { world, mayi } = raidReadyWorld();
        const seq = [0.01, 0.5, 0.7]; // 胜 → 不斩 → 遁走
        let i = 0;
        executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(mayi.faction).toBe('tang');
        expect(world.generals.some((x) => x.id === 'songjingang')).toBe(false);
        expect(world.chronicle.some((l) => l.includes('遁走'))).toBe(true);
    });

    it('阵斩：胜利而不破城时 12% 概率斩将（构造序列）', () => {
        const world = freshWorld();
        forceMayiTarget(world);
        const mayi = world.cities.find((c) => c.id === 'mayi')!;
        mayi.generalId = 'liuwuzhou';
        mayi.defense = 9;
        mayi.army = 2000; // 高兵高防：破城需 army ≤ 800 或 defense ≤ 2（战后余兵仍须 > 800）
        mayi.troops = { fubing: 2000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        // 序列：battle 胜掷 0.01（胜）→ 阵斩掷 0.01 < 0.12 → 斩
        const seq = [0.01, 0.01];
        let i = 0;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(out.ok).toBe(true);
        expect(mayi.faction).toBe('liu'); // 未破城
        expect(world.generals.some((x) => x.id === 'liuwuzhou')).toBe(false);
        expect(mayi.generalId).toBeNull();
        expect(world.flags['kills']).toBe(1);
        expect(world.chronicle.some((l) => l.includes('阵斩'))).toBe(true);
    });
});

describe('功业 M6（19 项）', () => {
    it('成就总数 19，新增三项 id 齐备', () => {
        expect(ACHIEVEMENTS).toHaveLength(19);
        expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(expect.arrayContaining(['no-blood', 'general-slayer', 'burn-granary']));
    });

    it('兵不血刃 / 阵斩敌将 / 火焚其粮 按计数解锁且不重复', () => {
        const world = freshWorld();
        world.flags['persuades'] = 1;
        world.flags['kills'] = 1;
        world.flags['burns'] = 3;
        const got = checkAchievements(world);
        expect(got).toEqual(expect.arrayContaining(['no-blood', 'general-slayer', 'burn-granary']));
        expect(checkAchievements(world)).toHaveLength(0);
    });

    it('整回合流转后 achievements 数组仍随 TurnOutcome 输出', () => {
        const world = freshWorld();
        world.flags['kills'] = 1;
        world.seasonIndex = 1;
        world.turn = 9;
        const out = runWorldTurn(world, HIGH);
        expect(out.achievements).toContain('general-slayer');
    });
});
