import { CITIES } from '../data/Cities';
import type { CityState } from './ResourceSystem';

export function createCityStates(): CityState[] {
    return CITIES.map((c) => ({
        id: c.id,
        name: c.name,
        faction: c.faction,
        population: c.tier === 1 ? 15 : 8,
        food: 2000,
        gold: 600,
        army: c.tier === 1 ? 8000 : 4000,
        defense: 5,
        morale: 80,
        generalId: null,
        facilities: { farm: 1, market: 0, barracks: 0, granary: 0 },
        policyUsed: false,
        troops: { fubing: c.tier === 1 ? 8000 : 4000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 }
    }));
}

export function findCity(states: CityState[], id: string): CityState | undefined {
    return states.find((c) => c.id === id);
}

export function resetTurnFlags(states: CityState[]): void {
    for (const c of states) {
        c.policyUsed = false;
    }
}
