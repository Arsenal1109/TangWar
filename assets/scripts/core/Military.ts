import type { CityState } from './ResourceSystem';
import { TROOPS, type TroopType } from '../data/Troops';
import { addTroops } from './Army';
import type { ApplyResult } from './PolicySystem';

/** 募兵：thousands 千人；costMultiplier 由特产（马政 0.8）等在调用方折算。 */
export function recruit(city: CityState, type: TroopType, thousands: number, costMultiplier = 1): ApplyResult {
    const def = TROOPS[type];
    const cost = Math.round(def.cost * thousands * costMultiplier);
    if (city.gold < cost) {
        return { ok: false, reason: '黄金不足' };
    }
    city.gold -= cost;
    addTroops(city, type, Math.round(thousands * 1000));
    return { ok: true, reason: '' };
}
