import { describe, it, expect } from 'vitest';
import { createGeneralStates, assignGeneral, unassignGeneral, changeLoyalty, getGeneralState } from '../assets/scripts/core/GeneralSystem';

describe('GeneralSystem 将领', () => {
    it('初始化 12 位李唐将领且都有五维', () => {
        const gs = createGeneralStates();
        expect(gs.length).toBe(12);
        expect(gs.every((g) => g.stats.command >= 1 && g.stats.command <= 100)).toBe(true);
        expect(gs.every((g) => g.assignment === null)).toBe(true);
    });

    it('任命守将后不可重复任命他职', () => {
        const gs = createGeneralStates();
        const r = assignGeneral(gs[0], 'taiyuan', 'governor');
        expect(r.ok).toBe(true);
        expect(gs[0].assignment).toEqual({ role: 'governor', cityId: 'taiyuan' });
        const r2 = assignGeneral(gs[0], 'jinyang', 'commander');
        expect(r2.ok).toBe(false);
    });

    it('解除任命恢复可用', () => {
        const gs = createGeneralStates();
        assignGeneral(gs[0], 'taiyuan', 'governor');
        unassignGeneral(gs[0]);
        expect(gs[0].assignment).toBeNull();
    });

    it('忠诚增减被限制在 1..100', () => {
        const gs = createGeneralStates();
        changeLoyalty(gs[0], -200);
        expect(gs[0].loyalty).toBe(1);
        changeLoyalty(gs[0], 200);
        expect(gs[0].loyalty).toBe(100);
    });

    it('getGeneralState 按 id 取回', () => {
        const gs = createGeneralStates();
        expect(getGeneralState(gs, 'lishimin').name).toBe('李世民');
    });
});
