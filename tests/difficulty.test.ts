import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { DIFFICULTIES, DIFFICULTY_ORDER, difficultyOf, applyDifficultyStart } from '../assets/scripts/core/Difficulty';
import { decideFactions, applyAiActions } from '../assets/scripts/core/AI';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';

const LOW = () => 0.02; // 必然进取

describe('Difficulty 难度分级', () => {
    it('三档定义完整：名称/描述/参数为正且单调递增', () => {
        expect(DIFFICULTY_ORDER).toEqual(['easy', 'normal', 'hard']);
        expect(DIFFICULTIES.easy.aiAggression).toBeLessThan(DIFFICULTIES.normal.aiAggression);
        expect(DIFFICULTIES.normal.aiAggression).toBeLessThan(DIFFICULTIES.hard.aiAggression);
        expect(DIFFICULTIES.easy.playerStart).toBeGreaterThan(1);
        expect(DIFFICULTIES.hard.playerStart).toBeLessThan(1);
        expect(DIFFICULTIES.hard.aiStipend).toBeGreaterThan(DIFFICULTIES.normal.aiStipend);
        for (const id of DIFFICULTY_ORDER) {
            expect(DIFFICULTIES[id].name.length).toBeGreaterThan(0);
            expect(DIFFICULTIES[id].desc.length).toBeGreaterThan(0);
        }
    });

    it('未知难度回落标准', () => {
        expect(difficultyOf(undefined).id).toBe('normal');
        expect(difficultyOf('lunatic').id).toBe('normal');
        expect(difficultyOf('hard').id).toBe('hard');
    });

    it('新局初始资源：休明唐室粮金 ×1.5，虎狼 ×0.75，且只作用于唐城', () => {
        const base = createCityStates();
        const taiyuan = base.find((c) => c.id === 'taiyuan')!;
        const mayi = base.find((c) => c.id === 'mayi')!;
        const foodBefore = taiyuan.food;
        const goldBefore = taiyuan.gold;
        const enemyFood = mayi.food;

        applyDifficultyStart({ cities: base }, 'easy');
        expect(taiyuan.food).toBe(Math.round(foodBefore * 1.5));
        expect(taiyuan.gold).toBe(Math.round(goldBefore * 1.5));
        expect(mayi.food).toBe(enemyFood); // 敌城不受影响

        applyDifficultyStart({ cities: base }, 'hard');
        // hard 在 easy 之后叠加：1.5×0.75 = 1.125
        expect(taiyuan.food).toBe(Math.round(Math.round(foodBefore * 1.5) * 0.75));
    });

    it('难度影响群雄进取：虎狼扩张决策多于休明（同随机流）', () => {
        const expansionCount = (difficulty: 'easy' | 'hard'): number => {
            const w = createWorld(617, createCityStates(), [], undefined, [], difficulty);
            let count = 0;
            for (let seed = 0; seed < 200; seed++) {
                let s = seed * 2654435761;
                const rng = (): number => {
                    s = (s * 1103515245 + 12345) & 0x7fffffff;
                    return s / 0x7fffffff;
                };
                count += decideFactions(w, rng).filter((a) => a.kind === 'expand').length;
            }
            return count;
        };
        expect(expansionCount('hard')).toBeGreaterThan(expansionCount('easy'));
    });

    it('难度补贴：虎狼每季群雄城池入账 70 粮金，唐城不入账', () => {
        const w = createWorld(617, createCityStates(), [], undefined, [], 'hard');
        const taiyuan = w.cities.find((c) => c.id === 'taiyuan')!;
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        const tangGold = taiyuan.gold;
        const enemyGold = mayi.gold;
        runWorldTurn(w, () => 0.95);
        // 马邑（tier-0，人口 8 万）：常规税 32 + 虎狼补贴 70 = +102
        expect(mayi.gold).toBe(enemyGold + 32 + 70);
        // 唐城（太原，人口 15 万）：只有常规税 60，不吃补贴
        expect(taiyuan.gold).toBe(tangGold + 60);
    });

    it('休明无补贴：群雄城池只走常规税收', () => {
        const w = createWorld(617, createCityStates(), [], undefined, [], 'easy');
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        const enemyGold = mayi.gold;
        runWorldTurn(w, () => 0.95);
        expect(mayi.gold).toBe(enemyGold + 32);
    });

    it('难度随存档持久化，旧档缺省回落标准', () => {
        const w = createWorld(617, createCityStates(), [], undefined, [], 'hard');
        const data = serializeSave(w);
        expect(data.difficulty).toBe('hard');

        const restored = createWorld(617, createCityStates());
        expect(restored.difficulty).toBe('normal');
        applySave(restored, data);
        expect(restored.difficulty).toBe('hard');

        // v1 旧档：无 difficulty 字段 → 标准难度
        const legacy = { ...data, meta: { ...data.meta, version: 1 }, difficulty: undefined };
        const fromV1 = createWorld(617, createCityStates());
        applySave(fromV1, legacy as typeof data);
        expect(fromV1.difficulty).toBe('normal');
    });

    it('AI 结算兼容难度字段：虎狼下远征军不会白拿满编城', () => {
        const w = createWorld(617, createCityStates(), [], undefined, [], 'hard');
        const changan = w.cities.find((c) => c.id === 'changan')!;
        changan.generalId = 'liyuan';
        const actions = decideFactions(w, LOW);
        applyAiActions(w, actions, () => 0.95); // 战斗骰高位：远征军惨败
        expect(w.cities.find((c) => c.id === 'changan')!.faction).toBe('tang');
    });
});
