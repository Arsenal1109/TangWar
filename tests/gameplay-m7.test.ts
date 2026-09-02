import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { rollRandomEvent } from '../assets/scripts/core/RandomEvents';
import { checkAchievements } from '../assets/scripts/core/Achievements';
import { executeCouncilOrder } from '../assets/scripts/core/CommandSystem';
import { resolveTurn } from '../assets/scripts/core/ResourceSystem';
import { proclaimEmperor, canProclaim, ERAS, PROCLAIM_MIN_CITIES } from '../assets/scripts/core/ImperialSystem';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import type { WorldState } from '../assets/scripts/core/WorldState';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

/** 八城唐土：把任意六座非唐城划归唐 */
function expandTang(world: WorldState, count = 6) {
    for (const c of world.cities) {
        if (c.faction !== 'tang' && count > 0) {
            c.faction = 'tang';
            count--;
        }
    }
}

describe('称帝建元', () => {
    it('八城方可即位：七城被拒，八城可行', () => {
        const world = freshWorld();
        expect(canProclaim(world)).toBe(false);
        const r7 = proclaimEmperor(world, 'wude');
        expect(r7.ok).toBe(false);
        expect(r7.reason).toContain('八城');
        expandTang(world, 5); // 开局唐土 3 城（太原/晋阳/大兴）→ +5 = 8
        expect(world.cities.filter((c) => c.faction === 'tang')).toHaveLength(PROCLAIM_MIN_CITIES);
        expect(canProclaim(world)).toBe(true);
    });

    it('武德：即位时唐土民心 +5、群雄关系 -10、史册纪元', () => {
        const world = freshWorld();
        expandTang(world);
        const tangCity = world.cities.find((c) => c.faction === 'tang' && c.id === 'taiyuan')!;
        tangCity.morale = 60;
        world.diplomacy.relations.xia = 20;
        const r = proclaimEmperor(world, 'wude');
        expect(r.ok).toBe(true);
        expect(world.eraName).toBe('武德');
        expect(world.flags['proclaimed']).toBe(true);
        expect(tangCity.morale).toBe(65);
        expect(world.diplomacy.relations.xia).toBe(10);
        expect(world.chronicle.some((l) => l.includes('建元武德'))).toBe(true);
        expect(world.log.some((l) => l.includes('大唐'))).toBe(true);
    });

    it('义宁：怀柔减半（-5）；天授：威望旗标 +15', () => {
        const w1 = freshWorld();
        expandTang(w1);
        w1.diplomacy.relations.xia = 20;
        proclaimEmperor(w1, 'yining');
        expect(w1.eraName).toBe('义宁');
        expect(w1.diplomacy.relations.xia).toBe(15);

        const w2 = freshWorld();
        expandTang(w2);
        const r2 = proclaimEmperor(w2, 'tianshou');
        expect(r2.ok).toBe(true);
        expect(w2.flags['eraPrestige']).toBe(15);
    });

    it('不可重复称帝；年号随档持久化', () => {
        const world = freshWorld();
        expandTang(world);
        expect(proclaimEmperor(world, 'wude').ok).toBe(true);
        expect(proclaimEmperor(world, 'tianshou').ok).toBe(false);
        expect(world.eraName).toBe('武德');
        const save = serializeSave(world, 5);
        const world2 = freshWorld();
        applySave(world2, save);
        expect(world2.eraName).toBe('武德');
        expect(world2.flags['proclaimed']).toBe(true);
        // 旧档无 eraName → null
        const legacy = { ...save, eraName: undefined };
        const world3 = freshWorld();
        applySave(world3, legacy as typeof save);
        expect(world3.eraName).toBeNull();
    });

    it('ERAS 三号齐备、id 可反查', () => {
        expect(ERAS.map((e) => e.id)).toEqual(['wude', 'tianshou', 'yining']);
        expect(ERAS.every((e) => e.desc.length > 4)).toBe(true);
    });
});

describe('季节农时', () => {
    it('秋收：成都粮产 ×1.25（膏腴叠加）', () => {
        const world = freshWorld();
        const chengdu = world.cities.find((c) => c.id === 'chengdu')!;
        chengdu.food = 0;
        chengdu.army = 0;
        resolveTurn([chengdu], 5, undefined, 2);
        const base = Math.floor(chengdu.population * 10 * (1 + 0.2 * chengdu.facilities.farm));
        expect(chengdu.food).toBe(Math.floor(base * 1.15 * 1.25));
    });

    it('冬藏：成都粮产 ×0.7', () => {
        const world = freshWorld();
        const chengdu = world.cities.find((c) => c.id === 'chengdu')!;
        chengdu.food = 0;
        chengdu.army = 0;
        resolveTurn([chengdu], 5, undefined, 3);
        const base = Math.floor(chengdu.population * 10 * (1 + 0.2 * chengdu.facilities.farm));
        expect(chengdu.food).toBe(Math.floor(base * 1.15 * 0.7));
    });

    it('缺省无农时修正（旧调用不受影响）', () => {
        const world = freshWorld();
        const chengdu = world.cities.find((c) => c.id === 'chengdu')!;
        chengdu.food = 0;
        chengdu.army = 0;
        resolveTurn([chengdu], 5);
        const base = Math.floor(chengdu.population * 10 * (1 + 0.2 * chengdu.facilities.farm));
        expect(chengdu.food).toBe(Math.floor(base * 1.15));
    });
});

describe('灾异扩展', () => {
    /** 构造 rng 序列：先过触发门（0.01 < 0.056），再掷事件（权重 19），再选城 */
    function eventSeq(world: WorldState, eventDraw: number, cityId: string, pool: 'all' | 'tang'): () => number {
        const list = pool === 'tang' ? world.cities.filter((c) => c.faction === 'tang') : world.cities;
        const idx = list.findIndex((c) => c.id === cityId);
        const cityDraw = (idx + 0.001) / list.length;
        const seq = [0.01, eventDraw, cityDraw];
        let i = 0;
        return () => seq[i++ % seq.length];
    }

    it('河堤决口：粮草折三成×难度、人口微损', () => {
        const world = freshWorld();
        const target = world.cities.find((c) => c.id === 'chengdu')!;
        target.food = 2000;
        target.population = 15;
        world.turn = 9; // 事件不作用于头两回合
        // flood 权重 2/19 → 0.001×19 < 2
        rollRandomEvent(world, eventSeq(world, 0.001, 'chengdu', 'all'));
        expect(target.food).toBe(2000 - Math.floor(2000 * 0.3 * 0.9));
        expect(target.population).toBe(Math.floor(15 * (1 - 0.03 * 0.9)));
        expect(world.log.some((l) => l.includes('河堤决口'))).toBe(true);
    });

    it('祥瑞甘露：唐城民心 +6（标准难度）', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        taiyuan.morale = 70;
        world.turn = 9;
        // omen 累计权重 (2,4]/19 → 0.15
        rollRandomEvent(world, eventSeq(world, 0.15, 'taiyuan', 'tang'));
        expect(taiyuan.morale).toBe(76);
    });

    it('流民来投：唐城人口 +6%', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        const pop = taiyuan.population;
        world.turn = 9;
        rollRandomEvent(world, eventSeq(world, 0.15, 'taiyuan', 'tang'));
        expect(taiyuan.population).toBe(Math.floor(pop * 1.06));
    });
});

describe('阵前单挑', () => {
    /** 单挑沙盘：太原攻马邑（守将刘武周，兵 2000 防九，胜而不破） */
    function duelWorld() {
        const world = freshWorld();
        for (const id of ['shuofang', 'ye', 'luoyang']) {
            const c = world.cities.find((x) => x.id === id)!;
            c.faction = 'tang';
        }
        const mayi = world.cities.find((c) => c.id === 'mayi')!;
        mayi.generalId = 'liuwuzhou';
        mayi.defense = 9;
        mayi.army = 2000;
        mayi.troops = { fubing: 2000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        return { world, mayi };
    }

    it('15% 机遇触发；李世民（天策）武勇压过刘武周，40% 阵斩', () => {
        const { world, mayi } = duelWorld();
        // 序列：胜掷 0.01 → 阵斩掷 0.5（免）→ 无破城（army 2000 战后>800 防九）→ 单挑掷 0.01 → 敌我武勇掷 0.9/0.01 → 斩将掷 0.01
        const seq = [0.01, 0.5, 0.01, 0.9, 0.01, 0.01];
        let i = 0;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(out.ok).toBe(true);
        expect(mayi.faction).toBe('liu'); // 未破城
        expect(world.generals.some((x) => x.id === 'liuwuzhou')).toBe(false); // 阵斩
        expect(mayi.generalId).toBeNull();
        expect(world.flags['kills']).toBe(1);
        expect(world.flags['duelWins']).toBe(1);
        expect(world.chronicle.some((l) => l.includes('单挑'))).toBe(true);
        expect(out.body).toContain('阵斩');
    });

    it('敌方武勇反压：太原民心 -6，无斩将', () => {
        const { world, mayi } = duelWorld();
        // 序列：胜 0.01 → 免斩 0.5 → 单挑 0.01 → 敌掷 0.01 / 我掷 0.99（武勇 93+0.3 vs 98+29.7? 需李值守城）
        // 太原守将李世民 valor 98? 李世民 valor 高——改用敌掷 0.99*30=29.7+93=122.7 > 我 0.01*30=0.3+valor
        const seq = [0.01, 0.5, 0.01, 0.01, 0.99];
        let i = 0;
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        const moraleBefore = taiyuan.morale;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(out.ok).toBe(true);
        expect(world.generals.some((x) => x.id === 'liuwuzhou')).toBe(true);
        expect(taiyuan.morale).toBe(moraleBefore - 6);
        expect(out.body).toContain('败归');
        expect(world.flags['duelWins']).toBeUndefined();
    });

    it('任一侧无守将则不触发单挑（不消耗额外掷点）', () => {
        const { world, mayi } = duelWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        taiyuan.generalId = null;
        // 序列：胜 0.01 → 免斩 0.5 →（无单挑）结束
        const seq = [0.01, 0.5];
        let i = 0;
        const out = executeCouncilOrder(world, 'raid', 'taiyuan', () => seq[i++ % seq.length]);
        expect(out.ok).toBe(true);
        expect(world.flags['duelWins']).toBeUndefined();
        expect(out.body).not.toContain('单挑');
    });
});

describe('称帝后合纵更易', () => {
    it('flag 合纵阈值降低由 AIDiplomacy 内部生效（冒烟：称帝整回合不崩）', () => {
        const world = freshWorld();
        expandTang(world);
        proclaimEmperor(world, 'wude');
        world.turn = 9;
        const out = runWorldTurn(world, HIGH);
        expect(out).toBeTruthy();
        expect(Array.isArray(out.log)).toBe(true);
        expect(world.eraName).toBe('武德');
        // 功业结算照常（八城唐土可能顺带解锁富甲一方/粮秣如山，不作零断言）
        expect(Array.isArray(out.achievements)).toBe(true);
        expect(world.achievements.every((id) => typeof id === 'string')).toBe(true);
    });
});
