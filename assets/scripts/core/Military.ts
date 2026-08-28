import type { CityState } from './ResourceSystem';
import { TROOPS, type TroopType } from '../data/Troops';
import { addTroops } from './Army';
import type { ApplyResult } from './PolicySystem';

export function recruit(city: CityState, type: TroopType, thousands: number): ApplyResult {
    const def = TROOPS[type];
    const cost = Math.round(def.cost * thousands);
    if (city.gold < cost) {
        return { ok: false, reason: '黄金不足' };
    }
    city.gold -= cost;
    addTroops(city, type, Math.round(thousands * 1000));
    return { ok: true, reason: '' };
}
