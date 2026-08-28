import { describe, it, expect } from 'vitest';
import { TurnManager } from '../assets/scripts/core/TurnManager';

describe('TurnManager 回合推进', () => {
    it('开局为大业十三年秋（第 0 回合）', () => {
        const t = new TurnManager(617, 2);
        expect(t.year).toBe(617);
        expect(t.getSeason()).toBe('秋');
        expect(t.getTurnNumber()).toBe(0);
    });

    it('推进一季：秋→冬，回合数 +1', () => {
        const t = new TurnManager(617, 2);
        t.advance();
        expect(t.getSeason()).toBe('冬');
        expect(t.getTurnNumber()).toBe(1);
    });

    it('冬后跨年：617 冬→618 春', () => {
        const t = new TurnManager(617, 3);
        t.advance();
        expect(t.year).toBe(618);
        expect(t.getSeason()).toBe('春');
        expect(t.getTurnNumber()).toBe(1);
    });

    it('年代名称：617=大业十三年，618=大业十四年·武德元年', () => {
        expect(TurnManager.eraName(617)).toBe('大业十三年');
        expect(TurnManager.eraName(618)).toBe('大业十四年·武德元年');
        expect(TurnManager.eraName(626)).toBe('武德九年');
    });
});
