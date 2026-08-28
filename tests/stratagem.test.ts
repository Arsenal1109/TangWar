import { describe, it, expect } from 'vitest';
import { sowDiscord, bribeGeneral, spreadRumor } from '../assets/scripts/core/Stratagem';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';

const LOW = () => 0.05;
const HIGH = () => 0.95;

describe('Stratagem 谋略', () => {
    it('离间成功：敌将忠诚下降', () => {
        const [target] = createGeneralStates();
        const before = target.loyalty;
        const res = sowDiscord(target, 90, 200, LOW);
        expect(res.ok).toBe(true);
        expect(target.loyalty).toBeLessThan(before);
    });

    it('离间需耗金且金不足失败', () => {
        const [target] = createGeneralStates();
        const res = sowDiscord(target, 90, 50, HIGH);
        expect(res.ok).toBe(false);
    });

    it('计取敌将：耗金 + 谋略 + 威望决定成功', () => {
        const [target] = createGeneralStates();
        target.loyalty = 40;
        const res = bribeGeneral(target, 90, 80, 2000, LOW);
        expect(res.ok).toBe(true);
        expect(target.loyalty).toBeLessThan(40);
    });

    it('谣言成功：敌城民心下降', () => {
        const res = spreadRumor(80, 90, 200, LOW);
        expect(res.ok).toBe(true);
        expect(res.moraleDelta).toBeLessThan(0);
    });
});
