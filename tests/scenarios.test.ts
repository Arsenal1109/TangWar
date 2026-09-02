import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { applyDifficultyStart } from '../assets/scripts/core/Difficulty';
import { SCENARIOS, applyScenario, scenarioOf, createScenarioWorld, SCENARIO_ORDER } from '../assets/scripts/core/Scenarios';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { checkVictory } from '../assets/scripts/core/Victory';

describe('Scenarios 开局剧本', () => {
    it('两份剧本元数据完备、id 唯一', () => {
        expect(SCENARIO_ORDER).toEqual(['taiyuan617', 'guanzhong621']);
        for (const s of SCENARIOS) {
            expect(s.name.length).toBeGreaterThan(0);
            expect(s.desc.length).toBeGreaterThan(0);
            expect(s.apply).toBeTypeOf('function');
        }
        expect(scenarioOf('taiyuan617').year).toBe(617);
        expect(scenarioOf('guanzhong621').year).toBe(621);
        expect(scenarioOf('unknown-id').id).toBe('taiyuan617'); // 未知回落史实
    });

    it('617 史实剧本不改写世界', () => {
        const world = createScenarioWorld('taiyuan617', 'normal', createCityStates(), createGeneralStates(), createDiplomacyState());
        expect(world.year).toBe(617);
        expect(world.cities.find((c) => c.id === 'jiangdu')!.faction).toBe('sui');
        expect(world.cities.find((c) => c.id === 'lanzhou')!.faction).toBe('qin');
    });

    it('621 关中既定：陇右巴蜀归唐、隋亡其城归吴、郑夏瓦岗扩军', () => {
        const world = createScenarioWorld('guanzhong621', 'normal', createCityStates(), createGeneralStates(), createDiplomacyState());
        expect(world.year).toBe(621);
        expect(world.cities.find((c) => c.id === 'jiangdu')!.faction).toBe('wu');
        expect(world.cities.find((c) => c.id === 'lanzhou')!.faction).toBe('tang');
        expect(world.cities.find((c) => c.id === 'wuwei')!.faction).toBe('tang');
        expect(world.cities.find((c) => c.id === 'chengdu')!.faction).toBe('tang');
        expect(world.cities.find((c) => c.id === 'luoyang')!.army).toBe(12000);
        expect(world.cities.find((c) => c.id === 'ye')!.army).toBe(11000);
        // 唐土 6 城（3 初始 + 3 新附）
        expect(world.cities.filter((c) => c.faction === 'tang')).toHaveLength(6);
        // 没有势力叫 sui 了
        expect(world.cities.some((c) => c.faction === 'sui')).toBe(false);
    });

    it('难度先应用、剧本后应用：剧本只改归属/年代，难度资源倍率保留', () => {
        const cities = createCityStates();
        const taiyuanBefore = cities.find((c) => c.id === 'taiyuan')!.food;
        const world = createWorld(617, cities, createGeneralStates(), createDiplomacyState());
        applyDifficultyStart(world, 'easy'); // 玩家资源 ×1.5
        const taiyuanAfterEasy = world.cities.find((c) => c.id === 'taiyuan')!.food;
        expect(taiyuanAfterEasy).toBeGreaterThan(taiyuanBefore);
        applyScenario(world, 'guanzhong621');
        // 剧本不改资源，只改归属
        expect(world.cities.find((c) => c.id === 'taiyuan')!.food).toBe(taiyuanAfterEasy);
        expect(world.year).toBe(621);
        // 史册记录开局大事
        expect(world.chronicle.length).toBe(1);
        expect(world.chronicle[0]).toContain('武德四年');
    });

    it('621 剧本下 626 年大限仍在：runWorldTurn 推进 20 回合可至武德九年', () => {
        const world = createScenarioWorld('guanzhong621', 'easy', createCityStates(), createGeneralStates(), createDiplomacyState());
        let victory = checkVictory(world);
        expect(victory.finished).toBe(false);
        for (let t = 0; t < 20 && !victory.finished; t++) {
            world.turn += 1;
            world.seasonIndex = world.turn % 4;
            runWorldTurn(world, () => 0.5);
            world.year = 621 + Math.floor(world.turn / 4);
            victory = checkVictory(world);
        }
        expect(world.year).toBe(626);
    });
});
