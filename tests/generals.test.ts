import { describe, it, expect } from 'vitest';
import { createGeneralStates, assignGeneral, unassignGeneral, changeLoyalty, getGeneralState } from '../assets/scripts/core/GeneralSystem';
import { GENERALS, INITIAL_GENERAL_CITY } from '../assets/scripts/data/Generals';
import { FACTIONS } from '../assets/scripts/data/Factions';
import { CITIES } from '../assets/scripts/data/Cities';

describe('GeneralSystem 将领', () => {
    it('初始化全部将领（李唐 + 群雄）且都有五维', () => {
        const gs = createGeneralStates();
        expect(gs.length).toBe(GENERALS.length);
        expect(gs.length).toBeGreaterThan(12); // 群雄将领已入场
        expect(gs.every((g) => g.stats.command >= 1 && g.stats.command <= 100)).toBe(true);
        expect(gs.every((g) => g.assignment === null)).toBe(true);
    });

    it('每个群雄势力至少有一名将领（战斗有统率、计策有目标）', () => {
        const gs = createGeneralStates();
        for (const f of FACTIONS) {
            if (f.id === 'tang') {
                continue;
            }
            expect(gs.some((g) => g.faction === f.id), `势力 ${f.id} 缺少将领`).toBe(true);
        }
    });

    it('初始任命表只把将领派驻到本势力城池', () => {
        for (const [cityId, generalId] of Object.entries(INITIAL_GENERAL_CITY)) {
            const city = CITIES.find((c) => c.id === cityId);
            const general = GENERALS.find((g) => g.id === generalId);
            expect(city, `未知城池 ${cityId}`).toBeDefined();
            expect(general, `未知将领 ${generalId}`).toBeDefined();
            if (city && general) {
                expect(general.faction, `${general.name}(${general.faction}) 被派驻到 ${city.name}(${city.faction})`).toBe(city.faction);
            }
        }
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
