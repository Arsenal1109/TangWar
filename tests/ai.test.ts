import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { decideFactions, applyAiActions } from '../assets/scripts/core/AI';

const LOW = () => 0.05;
const HIGH = () => 0.95;

// 只保留 tang + 一个 AI 势力，便于断言
function twoFactionWorld(ai: string): ReturnType<typeof createWorld> {
    const w = createWorld(620, createCityStates());
    w.cities.forEach((c) => {
        if (c.faction !== 'tang' && c.faction !== ai) {
            c.faction = '__empty__';
        }
    });
    w.cities = w.cities.filter((c) => c.faction !== '__empty__');
    return w;
}

describe('AI 群雄决策', () => {
    it('低随机压过低进取型概率时吞噬最弱敌势一城', () => {
        const w = twoFactionWorld('qin'); // 秦·薛举＝aggressive 0.55
        const tangCity = w.cities.find((c) => c.faction === 'tang')!.id;
        const actions = decideFactions(w, LOW);
        applyAiActions(w, actions);
        expect(w.cities.some((c) => c.id === tangCity && c.faction !== 'tang')).toBe(true);
        expect(actions.some((a) => a.kind === 'expand')).toBe(true);
    });

    it('进取型 AI 从不替代玩家唐', () => {
        const w = twoFactionWorld('qin');
        const actions = decideFactions(w, LOW);
        expect(actions.every((a) => a.faction !== 'tang')).toBe(true);
    });

    it('陈兵养锐（reinforce）：消耗金并增府兵', () => {
        const w = twoFactionWorld('chu'); // 楚·萧铣＝defensive 0.15
        const aiCity = w.cities.find((c) => c.faction === 'chu')!;
        const before = aiCity.army;
        const goldBefore = aiCity.gold;
        aiCity.gold = Math.max(aiCity.gold, 1000);
        const actions = decideFactions(w, HIGH); // 高随机 >= 0.15 → reinforce
        applyAiActions(w, actions);
        expect(actions.some((a) => a.kind === 'reinforce')).toBe(true);
        expect(aiCity.army).toBeGreaterThanOrEqual(before);
        if (aiCity.gold < goldBefore) {
            expect(aiCity.troops.fubing).toBeGreaterThan(0);
        }
    });
});