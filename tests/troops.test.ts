import { describe, it, expect } from 'vitest';
import { TROOPS, TROOP_ORDER, troopName, isCounter } from '../assets/scripts/data/Troops';

describe('六兵种数据', () => {
    it('恰好六种且顺序唯一', () => {
        expect(TROOP_ORDER.length).toBe(6);
        expect(new Set(TROOP_ORDER).size).toBe(6);
    });

    it('每种兵种的招募价/粮耗/攻防/速度为正', () => {
        for (const t of TROOP_ORDER) {
            const d = TROOPS[t];
            expect(d.cost).toBeGreaterThan(0);
            expect(d.foodPerThousand).toBeGreaterThan(0);
            expect(d.atk).toBeGreaterThan(0);
            expect(d.def).toBeGreaterThan(0);
            expect(d.speed).toBeGreaterThan(0);
            expect(troopName(t).length).toBeGreaterThan(0);
        }
    });

    it('克制关系：骑兵克弩兵、玄甲军克骑兵、弩兵克玄甲军', () => {
        expect(isCounter('qibing', 'nubing')).toBe(true);
        expect(isCounter('xuanjia', 'qibing')).toBe(true);
        expect(isCounter('nubing', 'xuanjia')).toBe(true);
    });
});
