import type { CityState } from './ResourceSystem';
import { TROOP_ORDER, type TroopType } from '../data/Troops';

export function addTroops(city: CityState, type: TroopType, amount: number): void {
    city.troops[type] += amount;
    city.army += amount;
}

export function removeArmy(city: CityState, amount: number): number {
    const before = city.army;
    let remaining = Math.min(amount, before);
    for (const t of TROOP_ORDER) {
        if (remaining <= 0) {
            break;
        }
        const take = Math.min(city.troops[t], remaining);
        city.troops[t] -= take;
        remaining -= take;
    }
    city.army = TROOP_ORDER.reduce((s, t) => s + city.troops[t], 0);
    return before - city.army;
}
