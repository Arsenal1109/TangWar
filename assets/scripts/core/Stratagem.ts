import type { GeneralState } from './GeneralSystem';
import type { ApplyResult } from './PolicySystem';

export interface StratagemResult extends ApplyResult {
    goldCost: number;
    loyaltyDelta?: number;
    moraleDelta?: number;
    message: string;
}

function clampLoyalty(v: number): number {
    return Math.max(1, Math.min(100, v));
}

export function sowDiscord(target: GeneralState, selfStrategy: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 100) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.3 + selfStrategy / 300 - target.loyalty / 200);
    if (roll < prob) {
        const delta = -15;
        target.loyalty = clampLoyalty(target.loyalty + delta);
        return { ok: true, reason: '', goldCost: 100, loyaltyDelta: delta, message: `离间成功，${target.name}忠诚下降` };
    }
    return { ok: false, reason: '离间被识破', goldCost: 100, message: '离间失败，事泄' };
}

export function bribeGeneral(target: GeneralState, selfStrategy: number, prestige: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 500) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.2 + gold / 5000 + selfStrategy / 250 + prestige / 200 - target.loyalty / 150);
    if (roll < prob) {
        const delta = -30;
        target.loyalty = clampLoyalty(target.loyalty + delta);
        return { ok: true, reason: '', goldCost: gold, loyaltyDelta: delta, message: `重金收买${target.name}，其心已动` };
    }
    return { ok: false, reason: '收买被拒', goldCost: gold, message: `${target.name}忠贞不贰，金银尽失` };
}

export function spreadRumor(targetMorale: number, selfStrategy: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 50) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.5 + selfStrategy / 300);
    if (roll < prob) {
        const delta = -6;
        return { ok: true, reason: '', goldCost: 50, moraleDelta: delta, message: '谣言四起，敌城民心动摇' };
    }
    return { ok: false, reason: '谣言被识破', goldCost: 50, message: '谣言未能惑众' };
}
