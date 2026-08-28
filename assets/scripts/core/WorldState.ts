import type { CityState } from './ResourceSystem';

// 全局运行态：城池 + 年月 + 历史分支标志 + 每回合战报
export interface WorldState {
    year: number;
    seasonIndex: number;
    turn: number;
    cities: CityState[];
    flags: Record<string, boolean | number>; // 历史分支 / once 触发标志
    log: string[];
}

export function createWorld(year: number, cities: CityState[]): WorldState {
    return { year, seasonIndex: 2, turn: 0, cities, flags: {}, log: [] };
}

export function citiesOf(world: WorldState, faction: string): CityState[] {
    return world.cities.filter((c) => c.faction === faction);
}

export function countCities(world: WorldState, faction: string): number {
    return citiesOf(world, faction).length;
}

export function factionPower(world: WorldState, faction: string): number {
    return citiesOf(world, faction).reduce((s, c) => s + c.army, 0);
}