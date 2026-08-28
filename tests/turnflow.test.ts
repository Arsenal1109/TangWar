import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';

describe('TurnFlow 回合装配', () => {
    it('返回天下大事战报且未立即结束', () => {
        const w = createWorld(618, createCityStates());
        w.cities.forEach((c) => { c.faction = (c.faction === 'sui') ? 'tang' : c.faction; });
        const out = runWorldTurn(w, () => 0.05);
        expect(out).toBeTruthy();
        expect(out.log.length).toBeGreaterThan(0);
        expect(out.victory).toBeNull();
    });

    it('AI 扩张已应用到城池归属', () => {
        const w = createWorld(619, createCityStates());
        // 压低唐兵力使其成为最弱势力，AI 低随机必然向唐扩张
        w.cities.filter((c) => c.faction === 'tang').forEach((c) => { c.army = 1000; });
        const beforeTang = w.cities.filter((c) => c.faction === 'tang').length;
        runWorldTurn(w, () => 0.05); // 低随机 → 进取型 AI 扩张
        const afterTang = w.cities.filter((c) => c.faction === 'tang').length;
        expect(afterTang).toBeLessThan(beforeTang);
    });

    it('回合战报在每次结算后被清空重建', () => {
        const w = createWorld(618, createCityStates());
        runWorldTurn(w, () => 0.05);
        const first = w.log.length;
        expect(first).toBe(0); // runWorldTurn 结束已清空 log
    });
});