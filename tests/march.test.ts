import { describe, it, expect } from 'vitest';
import { marchTurns, createMarch, tickMarch, dominantSpeed } from '../assets/scripts/core/MarchSystem';
import { getCity } from '../assets/scripts/data/Cities';

const ZERO_TROOPS = { fubing: 0, qibing: 0, jingbing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };

describe('MarchSystem 行军', () => {
    it('距离越远回合越多；骑兵更快', () => {
        const from = getCity('taiyuan');
        const to = getCity('changan');
        const foot = marchTurns(from, to, 1.0);
        const horse = marchTurns(from, to, 2.0);
        expect(foot).toBeGreaterThan(horse);
        expect(foot).toBeGreaterThanOrEqual(1);
    });

    it('创建行军订单后每回合推进，到达返回 true', () => {
        const order = createMarch('m1', getCity('taiyuan'), getCity('changan'), { ...ZERO_TROOPS, fubing: 1000 });
        let guard = 0;
        while (!tickMarch(order) && guard < 100) {
            guard += 1;
        }
        expect(order.turnsLeft).toBe(0);
    });

    it('主导兵种决定行军速度（骑兵多则更快）', () => {
        const fast = dominantSpeed({ ...ZERO_TROOPS, qibing: 1000 });
        const slow = dominantSpeed({ ...ZERO_TROOPS, fubing: 1000 });
        expect(fast).toBeGreaterThan(slow);
    });
});
