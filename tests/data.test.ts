import { describe, it, expect } from 'vitest';
import { FACTIONS, getFaction } from '../assets/scripts/data/Factions';
import { CITIES, getCity } from '../assets/scripts/data/Cities';
import { GENERALS } from '../assets/scripts/data/Generals';

describe('数据表完整性', () => {
    it('应有 13 方群雄且 id 唯一', () => {
        const ids = FACTIONS.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(FACTIONS.length).toBe(13);
    });

    it('城池 id 唯一、势力引用有效、坐标在地图范围内', () => {
        const ids = CITIES.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of CITIES) {
            expect(() => getFaction(c.faction)).not.toThrow();
            expect(c.x).toBeGreaterThan(0);
            expect(c.x).toBeLessThan(640);
            expect(c.y).toBeGreaterThan(0);
            expect(c.y).toBeLessThan(560);
        }
    });

    it('应有 22 座城池', () => {
        expect(CITIES.length).toBe(22);
    });

    it('getCity 应能取回城池', () => {
        expect(getCity('taiyuan').name).toBe('太原');
        expect(getCity('taiyuan').faction).toBe('tang');
    });

    it('将领五维在 1..100，忠诚在 1..100', () => {
        for (const g of GENERALS) {
            expect(g.stats.command).toBeGreaterThanOrEqual(1);
            expect(g.stats.command).toBeLessThanOrEqual(100);
            expect(g.stats.politics).toBeGreaterThanOrEqual(1);
            expect(g.stats.politics).toBeLessThanOrEqual(100);
            expect(g.stats.strategy).toBeGreaterThanOrEqual(1);
            expect(g.stats.strategy).toBeLessThanOrEqual(100);
            expect(g.stats.valor).toBeGreaterThanOrEqual(1);
            expect(g.stats.valor).toBeLessThanOrEqual(100);
            expect(g.stats.prestige).toBeGreaterThanOrEqual(1);
            expect(g.stats.prestige).toBeLessThanOrEqual(100);
            expect(g.loyalty).toBeGreaterThanOrEqual(1);
            expect(g.loyalty).toBeLessThanOrEqual(100);
        }
    });
});
