import { describe, it, expect } from 'vitest';
import { resolveTurn, type CityState } from '../assets/scripts/core/ResourceSystem';

function makeCity(partial: Partial<CityState>): CityState {
    return {
        id: 'c', name: '城', faction: 'tang', population: 10, food: 1000,
        gold: 100, army: 5000, defense: 5, morale: 80, generalId: null,
        facilities: { farm: 0, market: 0, barracks: 0, granary: 0 },
        policyUsed: false,
        ...partial
    };
}

describe('ResourceSystem 回合结算', () => {
    it('有粮时：金产 + 粮产 - 军粮消耗', () => {
        const city = makeCity({ gold: 100, food: 1000, army: 4000, population: 10 });
        const res = resolveTurn([city], 5);
        expect(res.deltas.gold).toBeGreaterThan(0);
        // 军粮 = 4000/1000 * 5 = 20；粮产 = floor(10/10)*100 = 100
        expect(res.deltas.food).toBe(100 - 20);
        expect(res.events.length).toBe(0);
    });

    it('缺粮时：触发缺粮事件且民心下降', () => {
        const city = makeCity({ population: 0, food: 5, army: 4000, morale: 80 });
        const res = resolveTurn([city], 5);
        expect(res.deltas.food).toBeLessThan(0);
        expect(res.events.some((e) => e.cityId === 'c' && e.type === 'food-shortage')).toBe(true);
        expect(city.morale).toBeLessThan(80);
    });

    it('军队超过粮草上限会逃兵', () => {
        const city = makeCity({ population: 0, food: 0, army: 4000, morale: 80 });
        const res = resolveTurn([city], 5);
        expect(city.army).toBeLessThan(4000);
    });
});
