import { describe, it, expect } from 'vitest';
import { createDiplomacyState, performDiplo } from '../assets/scripts/core/Diplomacy';

const LOW = () => 0.05;
const HIGH = () => 0.95;

describe('Diplomacy 外交', () => {
    it('开局关系：隋 -60、定杨 -40、瓦岗 +20', () => {
        const d = createDiplomacyState('tang');
        expect(d.relations.sui).toBe(-60);
        expect(d.relations.liu).toBe(-40);
        expect(d.relations.wa).toBe(20);
    });

    it('关系良好时结盟成功并扣金', () => {
        const d = createDiplomacyState('tang');
        d.relations.wa = 50;
        const res = performDiplo(d, 'tang', 'wa', 'alliance', { gold: 500, prestige: 80, armyPower: 10000, rng: LOW });
        expect(res.ok).toBe(true);
        expect(res.goldCost).toBeGreaterThan(0);
        expect(d.relations.wa).toBeGreaterThan(50);
        expect(d.allies).toContain('wa');
    });

    it('关系恶劣时结盟失败', () => {
        const d = createDiplomacyState('tang');
        d.relations.wa = -80;
        const res = performDiplo(d, 'tang', 'wa', 'alliance', { gold: 500, prestige: 80, armyPower: 10000, rng: HIGH });
        expect(res.ok).toBe(false);
    });

    it('进贡必定提升关系', () => {
        const d = createDiplomacyState('tang');
        const before = d.relations.sui;
        const res = performDiplo(d, 'tang', 'sui', 'tribute', { gold: 500, prestige: 80, armyPower: 10000, rng: LOW });
        expect(res.ok).toBe(true);
        expect(d.relations.sui).toBeGreaterThan(before);
    });

    it('威胁敌势可震慑（成功降其关系）', () => {
        const d = createDiplomacyState('tang');
        d.relations.liu = -40;
        const res = performDiplo(d, 'tang', 'liu', 'threaten', { gold: 0, prestige: 90, armyPower: 50000, rng: LOW });
        expect(res.ok).toBe(true);
    });
});
