import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { executeCouncilOrder, raidTarget, raidOdds, commandOf, COUNCIL_COSTS, AMBUSH_BONUS } from '../assets/scripts/core/CommandSystem';

function freshWorld(): WorldState {
    return createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
}

describe('CommandSystem 军议三令（真实结算）', () => {
    it('防御：消耗粮草，提升城防与民心', () => {
        const w = freshWorld();
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        const foodBefore = taiyuan.food;
        const defBefore = taiyuan.defense;
        const out = executeCouncilOrder(w, 'defend', 'taiyuan', () => 0.5);
        expect(out.ok).toBe(true);
        expect(out.tone).toBe('good');
        expect(taiyuan.food).toBe(foodBefore - COUNCIL_COSTS.defend);
        expect(taiyuan.defense).toBe(defBefore + 8);
        expect(taiyuan.morale).toBeGreaterThan(80);
    });

    it('安抚：得府兵六百并提升民心', () => {
        const w = freshWorld();
        const jinyang = w.cities.find((c) => c.id === 'jinyang')!;
        const armyBefore = jinyang.army;
        const out = executeCouncilOrder(w, 'pacify', 'jinyang', () => 0.5);
        expect(out.ok).toBe(true);
        expect(jinyang.army).toBe(armyBefore + 600);
        expect(jinyang.troops.fubing).toBeGreaterThanOrEqual(600);
    });

    it('粮草不足时军令失败且不产生副作用', () => {
        const w = freshWorld();
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        taiyuan.food = 10;
        const out = executeCouncilOrder(w, 'raid', 'taiyuan', () => 0.5);
        expect(out.ok).toBe(false);
        expect(out.reason).toContain('粮草不足');
        expect(taiyuan.food).toBe(10);
    });

    it('突袭目标为相邻敌城：太原就近取马邑（刘武周）', () => {
        const w = freshWorld();
        const target = raidTarget(w, 'taiyuan');
        expect(target).not.toBeNull();
        expect(target!.id).toBe('mayi');
        expect(target!.faction).toBe('liu');
    });

    it('突袭使用真实战斗结算：高随机（低胜率骰）下可能失败并损兵', () => {
        const w = freshWorld();
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        const taiyuanArmy = taiyuan.army;
        const mayiArmy = mayi.army;
        // rng()=0.99 几乎必然落败（胜率不可能 ≥99%）
        const out = executeCouncilOrder(w, 'raid', 'taiyuan', () => 0.99);
        expect(out.ok).toBe(true);
        expect(out.tone).toBe('bad');
        expect(taiyuan.army).toBeLessThan(taiyuanArmy); // 我军有真实伤亡
        expect(mayi.faction).toBe('liu'); // 失败不夺城
        expect(out.raidTargetId).toBe('mayi');
    });

    it('突袭大胜且守军残破时夺城：缴获黄金、城池易主', () => {
        const w = freshWorld();
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        mayi.army = 100;
        mayi.troops = { fubing: 100, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        mayi.defense = 1;
        mayi.gold = 1000;
        const out = executeCouncilOrder(w, 'raid', 'taiyuan', () => 0.0);
        expect(out.ok).toBe(true);
        expect(out.tone).toBe('good');
        expect(mayi.faction).toBe('tang'); // 夺城
        expect(mayi.generalId).toBeNull();
        expect(mayi.gold).toBeLessThan(1000); // 缴获三成
        expect(out.body).toContain('马邑');
    });

    it('伏兵计策（ambushReady）：消耗标志并显著提高胜算', () => {
        const withAmbush = freshWorld();
        withAmbush.flags['ambushReady'] = true;
        const plain = freshWorld();
        // 同一态势下：伏兵（无视城防加成）胜算严格更高
        const oddsAmbush = raidOdds(withAmbush, 'taiyuan');
        const oddsPlain = raidOdds(plain, 'taiyuan');
        expect(oddsAmbush).toBeGreaterThan(oddsPlain);
        expect(oddsAmbush).toBeLessThanOrEqual(100);
        // 伏兵只策应一次：结算后标志被消耗
        const out = executeCouncilOrder(withAmbush, 'raid', 'taiyuan', () => 0.5);
        expect(out.ok).toBe(true);
        expect(withAmbush.flags['ambushReady']).toBe(false);
        expect(AMBUSH_BONUS).toBeGreaterThan(0);
    });

    it('raidOdds 无目标时为 0，UI 可据此禁用突袭', () => {
        const w = freshWorld();
        // 太原周边敌城全部改为唐
        for (const id of ['mayi', 'shuofang', 'ye', 'luoyang']) {
            const c = w.cities.find((x) => x.id === id)!;
            c.faction = 'tang';
        }
        expect(raidOdds(w, 'taiyuan')).toBe(0);
    });

    it('境内无敌军时突袭退回粮草', () => {
        const w = freshWorld();
        // 把太原周边敌城全部改为唐
        for (const id of ['mayi', 'shuofang']) {
            const c = w.cities.find((x) => x.id === id)!;
            c.faction = 'tang';
        }
        // ye/luoyang/jinyang 仍是敌/己混合——需要把 ye 与 luoyang 也改掉
        for (const id of ['ye', 'luoyang']) {
            const c = w.cities.find((x) => x.id === id)!;
            c.faction = 'tang';
        }
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        const foodBefore = taiyuan.food;
        const out = executeCouncilOrder(w, 'raid', 'taiyuan', () => 0.5);
        expect(out.ok).toBe(false);
        expect(taiyuan.food).toBe(foodBefore); // 粮草退回
    });

    it('守将统率参与结算：李世民驻太原统率 98（天策特技 +5 → 103）', () => {
        const w = freshWorld();
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        expect(commandOf(taiyuan, w.generals)).toBe(103); // 98 + 天策 5
        const chengdu = w.cities.find((c) => c.id === 'chengdu')!;
        expect(commandOf(chengdu, w.generals)).toBe(55); // 无守将默认
    });
});
