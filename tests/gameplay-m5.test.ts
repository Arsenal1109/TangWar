import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState, performDiplo, type DiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn, collectAllyTribute } from '../assets/scripts/core/TurnFlow';
import { checkAchievements, ACHIEVEMENTS } from '../assets/scripts/core/Achievements';
import { resolveTurn } from '../assets/scripts/core/ResourceSystem';
import { recruit } from '../assets/scripts/core/Military';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { CITY_SPECIALTIES, SPECIALTIES, specialtyOf, specialtyName } from '../assets/scripts/data/Specialties';
import { TROOPS } from '../assets/scripts/data/Troops';
import { getCity } from '../assets/scripts/data/Cities';
import type { TroopType } from '../assets/scripts/data/Troops';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

describe('城池特产', () => {
    it('数据：14 城有特产，名目可查', () => {
        expect(Object.keys(CITY_SPECIALTIES)).toHaveLength(14);
        expect(specialtyName('wuwei')).toBe('马政');
        expect(specialtyName('chengdu')).toBe('膏腴');
        expect(specialtyName('taiyuan')).toBe('雄关');
        expect(specialtyName('jiangdu')).toBe('商埠');
        expect(specialtyName('changan')).toBe('盐铁');
        expect(specialtyName('jinyang')).toBe('—');
        for (const id of Object.values(SPECIALTIES)) {
            expect(id.desc.length).toBeGreaterThan(4);
        }
    });

    it('商埠：江都商税 +15%（人口15·无商市 → floor(60×1.15)=69）', () => {
        const world = freshWorld();
        const jiangdu = world.cities.find((c) => c.id === 'jiangdu')!;
        jiangdu.gold = 0;
        resolveTurn([jiangdu], 0);
        expect(jiangdu.gold).toBe(69);
    });

    it('膏腴：成都粮产 +15%（农田1级：floor(floor(180)×1.15)=206）', () => {
        const world = freshWorld();
        const chengdu = world.cities.find((c) => c.id === 'chengdu')!;
        chengdu.food = 0;
        chengdu.army = 0; // 排除军粮消耗
        resolveTurn([chengdu], 5);
        // 设施加成先取整，特产再乘：镜像实现的双层 floor（180×1.15 在浮点下 = 206.999…）
        const base = Math.floor(chengdu.population * 10 * (1 + 0.2 * chengdu.facilities.farm));
        expect(chengdu.food).toBe(Math.floor(base * 1.15));
    });

    it('盐铁：长安金粮 +10%', () => {
        const world = freshWorld();
        const changan = world.cities.find((c) => c.id === 'changan')!;
        changan.gold = 0;
        changan.food = 0;
        changan.army = 0;
        resolveTurn([changan], 5);
        expect(changan.gold).toBe(Math.floor(changan.population * 4 * 1.1 * (changan.facilities.market > 0 ? 1 + 0.2 * changan.facilities.market : 1)));
        expect(changan.food).toBe(Math.floor(changan.population * 10 * 1.1 * (changan.facilities.farm > 0 ? 1 + 0.2 * changan.facilities.farm : 1)));
    });

    it('马政：凉州募骑兵八折，募府兵原价', () => {
        const world = freshWorld();
        const wuwei = world.cities.find((c) => c.id === 'wuwei')!;
        wuwei.gold = 100000;
        wuwei.troops = { fubing: 0, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        const goldBefore = wuwei.gold;
        recruit(wuwei, 'qibing', 1, 0.8);
        expect(goldBefore - wuwei.gold).toBe(Math.round(TROOPS.qibing.cost * 0.8));
        const g2 = wuwei.gold;
        recruit(wuwei, 'fubing', 1);
        expect(g2 - wuwei.gold).toBe(TROOPS.fubing.cost);
        void getCity;
    });
});

describe('联姻深化', () => {
    function diploState(): DiplomacyState {
        return { relations: { xia: 60 }, allies: [], atWar: [], marriedAllies: [] };
    }

    it('和亲成功：结盟 + 入 marriedAllies + 嫁妆讯息', () => {
        const state = diploState();
        const r = performDiplo(state, 'tang', 'xia', 'marriage', { gold: 1000, prestige: 80, armyPower: 5000, rng: LOW });
        expect(r.ok).toBe(true);
        expect(state.allies).toContain('xia');
        expect(state.marriedAllies).toContain('xia');
        expect(r.message).toContain('嫁妆');
    });

    it('重复和亲不重复入列', () => {
        const state = diploState();
        performDiplo(state, 'tang', 'xia', 'marriage', { gold: 1000, prestige: 80, armyPower: 5000, rng: LOW });
        performDiplo(state, 'tang', 'xia', 'marriage', { gold: 1000, prestige: 80, armyPower: 5000, rng: LOW });
        expect(state.marriedAllies?.filter((f) => f === 'xia')).toHaveLength(1);
    });

    it('联姻盟邦岁贡翻倍（240），普通盟邦 120', () => {
        const world = freshWorld();
        world.diplomacy.allies.push('wa', 'xia');
        world.diplomacy.marriedAllies = ['xia'];
        const before = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        const lines = collectAllyTribute(world);
        expect(lines).toHaveLength(2);
        expect(lines.some((l) => l.includes('240'))).toBe(true);
        const after = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        expect(after - before).toBe(360);
    });

    it('marriedAllies 随存档 v2 持久化', () => {
        const world = freshWorld();
        world.diplomacy.marriedAllies = ['xia', 'wa'];
        const save = serializeSave(world, 5);
        const world2 = freshWorld();
        applySave(world2, save);
        expect(world2.diplomacy.marriedAllies).toEqual(['xia', 'wa']);
        // 旧档（无该字段）回放为空数组不崩溃
        const legacy = { ...save, diplomacy: { ...save.diplomacy, marriedAllies: undefined } };
        const world3 = freshWorld();
        applySave(world3, legacy as typeof save);
        expect(world3.diplomacy.marriedAllies).toEqual([]);
    });
});

describe('成就扩展（16 项）', () => {
    it('成就总数达 19（M6 追加三项），新增项可解锁', () => {
        expect(ACHIEVEMENTS).toHaveLength(19);
        expect(ACHIEVEMENTS.map((a) => a.id)).toEqual(expect.arrayContaining([
            'veteran-army', 'blitz', 'comeback', 'gold-hoard', 'general-star', 'granary'
        ]));
    });

    it('百战精兵：10 胜解锁', () => {
        const world = freshWorld();
        world.flags['battleWins'] = 10;
        expect(checkAchievements(world)).toContain('veteran-army');
    });

    it('闪电奇袭：首年破城旗标', () => {
        const world = freshWorld();
        expect(checkAchievements(world)).not.toContain('blitz');
        world.flags['blitz'] = true;
        expect(checkAchievements(world)).toContain('blitz');
    });

    it('绝地复兴：lowPoint 旗标 + 重振六城', () => {
        const world = freshWorld();
        world.flags['lowPoint'] = true;
        expect(checkAchievements(world)).not.toContain('comeback');
        for (const c of world.cities) {
            if (c.faction !== 'tang') {
                c.faction = 'tang';
                break;
            }
        }
        expect(checkAchievements(world)).not.toContain('comeback');
        for (const c of world.cities) {
            if (c.faction !== 'tang') c.faction = 'tang';
        }
        expect(checkAchievements(world)).toContain('comeback');
    });

    it('名将如云：开局 12 将不解锁；收齐四位在野 + 两位叛将来投后达成', () => {
        const world = freshWorld();
        expect(world.generals.filter((g) => g.faction === 'tang')).toHaveLength(12);
        expect(checkAchievements(world)).not.toContain('general-star');
        for (const g of world.generals.filter((x) => x.faction === 'none')) {
            g.faction = 'tang'; // 16
        }
        expect(checkAchievements(world)).toContain('general-star');
    });

    it('整回合流转：lowPoint 标记在残局时置位', () => {
        const world = freshWorld();
        // 留两城，其余归敌
        const tang = world.cities.filter((c) => c.faction === 'tang');
        for (const c of world.cities) {
            if (c.faction === 'tang' && c.id !== tang[0].id && c.id !== tang[1].id) {
                c.faction = 'wa';
            }
        }
        runWorldTurn(world, HIGH);
        expect(world.flags['lowPoint']).toBe(true);
    });
});
