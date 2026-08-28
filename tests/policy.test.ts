import { describe, it, expect } from 'vitest';
import { applyPolicy } from '../assets/scripts/core/PolicySystem';
import { POLICIES } from '../assets/scripts/data/Policies';
import type { CityState } from '../assets/scripts/core/ResourceSystem';

function makeCity(partial: Partial<CityState>): CityState {
    return {
        id: 'c', name: '城', faction: 'tang', population: 10, food: 2000,
        gold: 2000, army: 5000, defense: 5, morale: 80, generalId: null,
        facilities: { farm: 1, market: 0, barracks: 0, granary: 0 }, policyUsed: false,
        ...partial
    };
}

describe('PolicySystem 施策', () => {
    it('劝课农桑：扣金 + 加粮 + 民心，并置 policyUsed', () => {
        const c = makeCity({ food: 2000, gold: 2000, morale: 80 });
        const res = applyPolicy(c, 'farming');
        expect(res.ok).toBe(true);
        expect(c.gold).toBe(2000 - 300);
        expect(c.food).toBe(2000 + 400);
        expect(c.morale).toBe(82);
        expect(c.policyUsed).toBe(true);
    });

    it('同一季不能二次施策', () => {
        const c = makeCity({});
        applyPolicy(c, 'farming');
        const res = applyPolicy(c, 'walls');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('本季已施行过内政');
    });

    it('黄金不足被拒绝', () => {
        const c = makeCity({ gold: 100 });
        const res = applyPolicy(c, 'walls');
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('黄金不足');
    });

    it('应有六种施策且 id 唯一', () => {
        const ids = POLICIES.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(POLICIES.length).toBe(6);
    });
});
