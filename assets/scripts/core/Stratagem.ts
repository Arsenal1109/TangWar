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
    if (gold < 80) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.3 + selfStrategy / 300 - target.loyalty / 200);
    if (roll < prob) {
        const delta = -15;
        target.loyalty = clampLoyalty(target.loyalty + delta);
        return { ok: true, reason: '', goldCost: 80, loyaltyDelta: delta, message: `离间成功，${target.name}忠诚下降` };
    }
    return { ok: false, reason: '离间被识破', goldCost: 80, message: '离间失败，事泄' };
}

export function bribeGeneral(target: GeneralState, selfStrategy: number, prestige: number, gold: number, rng?: () => number): StratagemResult {
    const roll = rng ? rng() : Math.random();
    if (gold < 400) {
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
    if (gold < 40) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.9, 0.5 + selfStrategy / 300);
    if (roll < prob) {
        const delta = -6;
        return { ok: true, reason: '', goldCost: 40, moraleDelta: delta, message: '谣言四起，敌城民心动摇' };
    }
    return { ok: false, reason: '谣言被识破', goldCost: 40, message: '谣言未能惑众' };
}

/** 劝降所需黄金 */
export const PERSUADE_COST = 300;
/** 劝降的民心门槛：低于此值城内厌战 */
export const PERSUADE_MORALE = 45;
/** 劫粮所需黄金 */
export const BURN_COST = 150;

export interface PersuadeOutcome extends StratagemResult {
    /** success 细分：city 城池易主；general 守将去向 */
    cityDefected?: boolean;
    generalJoined?: boolean;
}

/**
 * 劝降：对民心低落（< 45）的邻境敌城晓以利害。
 * 成功则城池易主——守将七成归附（忠诚 45），三成遁走；
 * 失败则守军戒备（民心 +5）、两国交恶。
 */
export function persuadeSurrender(
    world: {
        cities: Array<{ id: string; name: string; faction: string; morale: number; generalId: string | null }>;
        diplomacy: { relations: Record<string, number> };
        generals: Array<{ id: string; name: string; faction: string; loyalty: number }>;
    },
    targetCityId: string,
    targetFaction: string,
    selfStrategy: number,
    prestige: number,
    gold: number,
    rng: () => number
): PersuadeOutcome {
    const city = world.cities.find((c) => c.id === targetCityId);
    if (!city) {
        return { ok: false, reason: '目标城池不存在', goldCost: 0, message: '' };
    }
    if (city.faction === 'tang') {
        return { ok: false, reason: '此乃唐土', goldCost: 0, message: '' };
    }
    if (city.morale >= PERSUADE_MORALE) {
        return { ok: false, reason: `民心得固（${city.morale}），无可乘之隙`, goldCost: 0, message: '' };
    }
    if (gold < PERSUADE_COST) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const rel = world.diplomacy.relations[targetFaction] ?? 0;
    const prob = Math.min(0.85, (PERSUADE_MORALE - city.morale) / 80 + selfStrategy / 400 + prestige / 350);
    if (rng() < prob) {
        city.faction = 'tang';
        city.morale = 55;
        world.diplomacy.relations[targetFaction] = Math.max(-100, rel - 25);
        let generalJoined = false;
        if (city.generalId) {
            const g = world.generals.find((item) => item.id === city.generalId);
            generalJoined = rng() < 0.7;
            if (g) {
                if (generalJoined) {
                    g.faction = 'tang';
                    g.loyalty = 45;
                } else {
                    // 守将不附：遁走离场
                    const idx = world.generals.indexOf(g);
                    if (idx >= 0) world.generals.splice(idx, 1);
                    city.generalId = null;
                }
            }
        }
        return { ok: true, reason: '', goldCost: PERSUADE_COST, cityDefected: true, generalJoined, message: `${city.name}开城归唐，兵不血刃` };
    }
    city.morale = Math.min(100, city.morale + 5);
    world.diplomacy.relations[targetFaction] = Math.max(-100, rel - 10);
    return { ok: false, reason: '', goldCost: PERSUADE_COST, message: '守将坚壁拒之，戒备愈严' };
}

/**
 * 劫粮：焚敌积仓。成功则目标城粮草折损三成、民心受挫；
 * 失败则徒耗金资，两国交恶。
 */
export function burnGranary(
    target: { food: number; morale: number; generalId: string | null },
    cityDefense: number,
    selfStrategy: number,
    gold: number,
    rng: () => number
): StratagemResult {
    if (gold < BURN_COST) {
        return { ok: false, reason: '黄金不足', goldCost: 0, message: '' };
    }
    const prob = Math.min(0.8, 0.3 + selfStrategy / 300 - cityDefense / 60);
    if (rng() < prob) {
        const lost = Math.floor(target.food * 0.3);
        target.food -= lost;
        target.morale = Math.max(0, target.morale - 5);
        return { ok: true, reason: '', goldCost: BURN_COST, message: `粮仓火起，折损${lost}石，敌城汹汹` };
    }
    return { ok: false, reason: '', goldCost: BURN_COST, message: '细作事泄，焚仓未遂' };
}
