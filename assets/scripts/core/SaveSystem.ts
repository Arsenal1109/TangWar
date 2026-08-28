import type { WorldState } from './WorldState';
import type { CityState } from './ResourceSystem';
import type { TroopType } from '../data/Troops';

export const SAVE_VERSION = 1;

export interface SaveCity {
    id: string;
    faction: string;
    population: number;
    food: number;
    gold: number;
    army: number;
    defense: number;
    morale: number;
    generalId: string | null;
    facilities: CityState['facilities'];
    troops: Record<TroopType, number>;
}

export interface SaveData {
    meta: { version: number; savedAt: string };
    year: number;
    seasonIndex: number;
    turn: number;
    flags: Record<string, boolean | number>;
    cities: SaveCity[];
}

export function serializeSave(world: WorldState): SaveData {
    return {
        meta: { version: SAVE_VERSION, savedAt: new Date().toISOString() },
        year: world.year,
        seasonIndex: world.seasonIndex,
        turn: world.turn,
        flags: { ...world.flags },
        cities: world.cities.map((c) => ({
            id: c.id,
            faction: c.faction,
            population: c.population,
            food: c.food,
            gold: c.gold,
            army: c.army,
            defense: c.defense,
            morale: c.morale,
            generalId: c.generalId,
            facilities: { ...c.facilities },
            troops: { ...c.troops }
        }))
    };
}

export function applySave(world: WorldState, data: SaveData): void {
    if (data.meta.version !== SAVE_VERSION) {
        throw new Error(`存档版本不兼容: ${data.meta.version}`);
    }
    world.year = data.year;
    world.seasonIndex = data.seasonIndex;
    world.turn = data.turn;
    world.flags = { ...data.flags };
    // 按城池 id 原位回填，保证外层持有引用不变
    for (const c of world.cities) {
        const sc = data.cities.find((s) => s.id === c.id);
        if (!sc) {
            continue;
        }
        c.faction = sc.faction;
        c.population = sc.population;
        c.food = sc.food;
        c.gold = sc.gold;
        c.army = sc.army;
        c.defense = sc.defense;
        c.morale = sc.morale;
        c.generalId = sc.generalId;
        c.facilities = { ...sc.facilities };
        c.troops = { ...sc.troops };
    }
    world.log = [];
}