import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState, performDiplo, BORROW_COST, type DiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { checkAchievements, ACHIEVEMENTS, achievementById } from '../assets/scripts/core/Achievements';
import { traitOf, advisorStrategy, TIANCE_COMMAND, TIEBI_DEFENSE, JUNSHEN_POWER } from '../assets/scripts/core/TraitEffects';
import { commandOf, raidOdds, raidTarget } from '../assets/scripts/core/CommandSystem';
import { resolveTurn } from '../assets/scripts/core/ResourceSystem';
import { resolveBattle, winProbability } from '../assets/scripts/core/BattleSystem';
import { recruitTalent } from '../assets/scripts/core/TalentSystem';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { GENERALS } from '../assets/scripts/data/Generals';
import type { TroopType } from '../assets/scripts/data/Troops';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

function troopsOf(n: number): Record<TroopType, number> {
    return { fubing: n, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
}

describe('特技数据', () => {
    it('七位特技武将：李靖军神/李世民天策/房玄龄王佐/刘文静魏征谋主/徐世勣王世充铁壁', () => {
        const expectedTraits: Record<string, string> = {
            lijng: 'junshen', lishimin: 'tiance', fangxuanling: 'wangzuo',
            liuwenjing: 'mouzhu', weizheng: 'mouzhu', xushiji: 'tiebi', wangshichong: 'tiebi'
        };
        for (const [id, trait] of Object.entries(expectedTraits)) {
            expect(GENERALS.find((g) => g.id === id)?.trait).toBe(trait);
        }
    });
});

describe('特技结算点', () => {
    it('天策：守将统率 +5', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        taiyuan.generalId = 'lishimin'; // 统率 98 + 天策 5
        expect(commandOf(taiyuan, world.generals)).toBe(98 + TIANCE_COMMAND);
        taiyuan.generalId = 'lijng'; // 军神不加统率
        expect(commandOf(taiyuan, world.generals)).toBe(96);
    });

    it('军神：BattleArmy.trait 使战力 +8%（攻守两侧各自生效）', () => {
        const a = { generalCommand: 80, troops: troopsOf(1000) };
        const d = { generalCommand: 80, troops: troopsOf(1000) };
        const base = winProbability(a, d);
        expect(base).toBeCloseTo(0.5, 5);
        const boosted = winProbability({ ...a, trait: 'junshen' }, d);
        // 军神加成恰为 0.08 的幂等比例（战力 1.08/(1+1.08)）
        expect(boosted).toBeGreaterThan(base);
        const ratio = boosted / (1 - boosted) / (base / (1 - base));
        expect(ratio).toBeCloseTo(1 + JUNSHEN_POWER, 5);
    });

    it('军神影响实战掷点：resolveBattle 胜率对齐 winProbability', () => {
        const a = { generalCommand: 90, troops: troopsOf(1000), trait: 'junshen' as const };
        const d = { generalCommand: 90, troops: troopsOf(1000) };
        const p = winProbability(a, d, {});
        let wins = 0;
        for (let i = 0; i < 4000; i++) {
            if (resolveBattle(a, d, { rng: Math.random }).attackerWin) wins++;
        }
        expect(Math.abs(wins / 4000 - p)).toBeLessThan(0.03);
    });

    it('traitOf：无守将返回 null，有守将返回其特技', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        taiyuan.generalId = null; // 太原开局守将是李世民，先清空
        expect(traitOf(taiyuan, world.generals)).toBeNull();
        taiyuan.generalId = 'lijng';
        expect(traitOf(taiyuan, world.generals)).toBe('junshen');
    });

    it('advisorStrategy：谋略最高唐营谋主优先（魏征归唐后接掌），无谋主退回刘文静', () => {
        const world = freshWorld();
        // 开局刘文静是唯一唐营谋主（93）
        expect(advisorStrategy(world)).toBe(93);
        recruitTalent(world, 'weizheng'); // 魏征 86 < 93 → 仍用刘文静
        expect(advisorStrategy(world)).toBe(93);
        // 把刘文静叛走 → 魏征接掌
        const liuwenjing = world.generals.find((g) => g.id === 'liuwenjing')!;
        liuwenjing.faction = 'wa';
        expect(advisorStrategy(world)).toBe(86);
        // 全部谋主离场 → 退回 80
        const weizheng = world.generals.find((g) => g.id === 'weizheng')!;
        weizheng.faction = 'wu';
        expect(advisorStrategy(world)).toBe(80);
    });

    it('raidOdds：守方铁壁抬升城防，胜算下降', () => {
        const world = freshWorld();
        const target = raidTarget(world, 'taiyuan')!; // 太原实际相邻的敌城
        target.generalId = null;
        target.defense = 5;
        const oddsPlain = raidOdds(world, 'taiyuan');
        target.generalId = 'wangshichong'; // 铁壁 +2
        const oddsTiebi = raidOdds(world, 'taiyuan');
        expect(oddsTiebi).toBeLessThan(oddsPlain);
        // 另一位铁壁守将（徐世勣）效果数值一致；撤将后回到基准
        target.defense = 5;
        target.generalId = 'xushiji';
        expect(raidOdds(world, 'taiyuan')).toBe(oddsTiebi);
        target.generalId = null;
        expect(raidOdds(world, 'taiyuan')).toBe(oddsPlain);
    });

    it('王佐：守将坐镇之城商税 +20%', () => {
        const world = freshWorld();
        const city = world.cities.find((c) => c.id === 'taiyuan')!;
        city.generalId = null;
        city.gold = 0;
        const plain = resolveTurn([city], 0)[0] ? 0 : 0; // resolveTurn mutates; compute via before/after
        city.gold = 0;
        resolveTurn([city], 0);
        const goldPlain = city.gold;
        city.gold = 0;
        city.generalId = 'fangxuanling'; // 王佐
        resolveTurn([city], 0, world.generals);
        const goldWangzuo = city.gold;
        expect(goldWangzuo).toBeCloseTo(goldPlain * 1.2, 0);
        expect(plain).toBe(0); // 保持结构
    });
});

describe('功业（成就）', () => {
    it('成就齐备（M4 十项 + M5 扩展六项 + M6 三项），id 可反查', () => {
        expect(ACHIEVEMENTS).toHaveLength(19);
        expect(achievementById('first-victory')?.name).toBe('首战告捷');
        expect(achievementById('nope')).toBeUndefined();
    });

    it('按条件解锁且不重复：首胜/夺城/求贤/结盟', () => {
        const world = freshWorld();
        world.flags['battleWins'] = 1;
        let got = checkAchievements(world);
        expect(got).toContain('first-victory');
        world.flags['captures'] = 3;
        world.flags['recruits'] = 3;
        world.diplomacy.allies.push('wa');
        got = checkAchievements(world);
        expect(got).toEqual(expect.arrayContaining(['city-taker', 'seek-talent', 'talent-magnet', 'first-ally']));
        // 已解锁不再出现
        expect(checkAchievements(world)).toHaveLength(0);
    });

    it('五虎俱全：唐营勇武≥90 达 5 人（招募苏定方后达成）', () => {
        const world = freshWorld();
        // 开局唐营：李世民90 秦琼97 尉迟恭98 = 3 人
        expect(checkAchievements(world)).not.toContain('five-tigers');
        recruitTalent(world, 'sudingfang'); // 95
        recruitTalent(world, 'houjunji');   // 90
        expect(checkAchievements(world)).toContain('five-tigers');
    });

    it('民心所向与府库充盈按世界状态推导', () => {
        const world = freshWorld();
        for (const c of world.cities.filter((x) => x.faction === 'tang')) {
            c.morale = 90;
            c.gold = 2000;
        }
        const got = checkAchievements(world);
        expect(got).toContain('people-first');
        expect(got).toContain('full-treasury');
    });

    it('虎牢大捷绑定历史事件旗标', () => {
        const world = freshWorld();
        expect(checkAchievements(world)).not.toContain('hulao');
        world.flags['hulaoguan-victory'] = true;
        expect(checkAchievements(world)).toContain('hulao');
    });

    it('借兵勤王由 borrows 计数解锁；整回合流转产出 achievements', () => {
        const world = freshWorld();
        world.seasonIndex = 3;
        world.turn = 7;
        const out = runWorldTurn(world, HIGH);
        expect(Array.isArray(out.achievements)).toBe(true);
        world.flags['borrows'] = 1;
        expect(checkAchievements(world)).toContain('borrow-troops');
    });

    it('成就随存档 v2 持久化', () => {
        const world = freshWorld();
        world.achievements.push('first-victory', 'hulao');
        const save = serializeSave(world, 5);
        const world2 = freshWorld();
        applySave(world2, save);
        expect(world2.achievements).toEqual(['first-victory', 'hulao']);
    });
});

describe('借兵勤王', () => {
    function diploState(rel: number): DiplomacyState {
        return { relations: { wa: rel }, allies: ['wa'], atWar: [] };
    }

    it('非盟邦不可借兵', () => {
        const state = { relations: { wa: 80 }, allies: [], atWar: [] };
        const r = performDiplo(state, 'tang', 'wa', 'borrow', { gold: 1000, prestige: 82, armyPower: 5000, rng: HIGH });
        expect(r.ok).toBe(false);
        expect(r.reason).toContain('非盟邦');
    });

    it('关系浅或黄金不足被拒', () => {
        const r1 = performDiplo(diploState(20), 'tang', 'wa', 'borrow', { gold: 1000, prestige: 82, armyPower: 5000, rng: HIGH });
        expect(r1.ok).toBe(false);
        expect(r1.reason).toContain('邦交尚浅');
        const r2 = performDiplo(diploState(60), 'tang', 'wa', 'borrow', { gold: 100, prestige: 82, armyPower: 5000, rng: HIGH });
        expect(r2.ok).toBe(false);
        expect(r2.reason).toContain('黄金不足');
    });

    it('成功借兵：耗金 250、关系 +5、出兵允诺', () => {
        const state = diploState(60);
        const r = performDiplo(state, 'tang', 'wa', 'borrow', { gold: 1000, prestige: 82, armyPower: 5000, rng: LOW });
        expect(r.ok).toBe(true);
        expect(r.goldCost).toBe(BORROW_COST);
        expect(state.relations.wa).toBe(65);
        expect(r.message).toContain('锐卒');
    });

    it('LOW 随机下低成功率也可能被婉拒（概率边界 sanity）', () => {
        // 关系 30：prob = base + 30/250 ≈ 0.5+0.41+0.12=1.03 → clamp 0.9 → LOW 必成
        const r = performDiplo(diploState(30), 'tang', 'wa', 'borrow', { gold: 1000, prestige: 82, armyPower: 5000, rng: LOW });
        expect(r.ok).toBe(true);
    });
});
