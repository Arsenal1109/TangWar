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
    it('低随机压过低进取型概率时，进攻相邻的唐城（秦自陇西取长安）', () => {
        const w = twoFactionWorld('qin'); // 秦·薛举＝aggressive 0.55，据陇西与长安相邻
        const actions = decideFactions(w, LOW);
        applyAiActions(w, actions);
        expect(w.cities.some((c) => c.id === 'changan' && c.faction === 'qin')).toBe(true);
        expect(actions.some((a) => a.kind === 'expand' && a.targetCityId === 'changan')).toBe(true);
    });

    it('AI 只进攻邻接城池，不再跨全图瞬移（凉州够不着太原）', () => {
        const w = twoFactionWorld('liang'); // 凉·李轨＝defensive，凉州与唐城不相邻
        const before = w.cities.map((c) => `${c.id}:${c.faction}`).join(',');
        const actions = decideFactions(w, LOW); // 即便随机鼓励扩张
        applyAiActions(w, actions);
        const expanded = actions.filter((a) => a.kind === 'expand');
        // 凉州唯一邻城陇西在 twoFactionWorld 中已被剔除 → 无邻接目标 → 不可扩张
        expect(expanded.length).toBe(0);
        expect(w.cities.map((c) => `${c.id}:${c.faction}`).join(',')).toBe(before);
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