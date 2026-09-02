import { describe, it, expect } from 'vitest';
import { addTroops, removeArmy } from '../assets/scripts/core/Army';
import { recruit } from '../assets/scripts/core/Military';
import { TROOP_ORDER } from '../assets/scripts/data/Troops';
import { createCityStates } from '../assets/scripts/core/CityRegistry';

describe('Military 募兵与兵力账本', () => {
    // createCityStates()[0] = 太原（州府）：金 800、兵 8000、府兵 8000
    it('募兵：扣金并增加对应兵种与总兵力', () => {
        const [c] = createCityStates();
        const before = c.army;
        const res = recruit(c, 'nubing', 2); // 2 千人
        expect(res.ok).toBe(true);
        expect(c.gold).toBe(800 - 360);
        expect(c.troops.nubing).toBe(2000);
        expect(c.army).toBe(before + 2000);
    });

    it('黄金不足被拒绝', () => {
        const [c] = createCityStates();
        c.gold = 100;
        const res = recruit(c, 'xuanjia', 1);
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('黄金不足');
    });

    it('removeArmy 从府兵开始扣减且不超总量', () => {
        const [c] = createCityStates();
        const removed = removeArmy(c, 3000);
        expect(removed).toBe(3000);
        expect(c.army).toBe(8000 - 3000);
        expect(c.troops.fubing).toBe(8000 - 3000);
    });

    it('removeArmy 超量时清零', () => {
        const [c] = createCityStates();
        const removed = removeArmy(c, 99999);
        expect(c.army).toBe(0);
        expect(TROOP_ORDER.every((t) => c.troops[t] === 0)).toBe(true);
        expect(removed).toBe(8000);
    });

    it('addTroops 同步总兵力', () => {
        const [c] = createCityStates();
        addTroops(c, 'qibing', 1000);
        expect(c.troops.qibing).toBe(1000);
        expect(c.army).toBe(8000 + 1000);
    });
});
