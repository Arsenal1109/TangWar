import type { CityState } from './ResourceSystem';
import { getPolicy } from '../data/Policies';

export interface ApplyResult {
    ok: boolean;
    reason: string;
}

function clamp(v: number): number {
    return Math.max(0, Math.min(100, v));
}

export function applyPolicy(city: CityState, policyId: string): ApplyResult {
    if (city.policyUsed) {
        return { ok: false, reason: '本季已施行过内政' };
    }
    const p = getPolicy(policyId);
    if (city.gold < p.costGold) {
        return { ok: false, reason: '黄金不足' };
    }
    if (city.food < p.costFood) {
        return { ok: false, reason: '粮草不足' };
    }
    city.gold -= p.costGold;
    city.food -= p.costFood;
    city.gold += p.effects.gold;
    city.food += p.effects.food;
    city.population += p.effects.population;
    city.morale = clamp(city.morale + p.effects.morale);
    city.defense += p.effects.defense;
    city.army += p.effects.army;
    city.policyUsed = true;
    return { ok: true, reason: '' };
}
