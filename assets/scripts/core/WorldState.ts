import type { CityState } from './ResourceSystem';
import type { GeneralState } from './GeneralSystem';
import type { DiplomacyState } from './Diplomacy';
import type { MarchOrder } from './MarchSystem';
import type { DifficultyId } from './Difficulty';

// 全局运行态：城池 + 年月 + 历史分支标志 + 每回合战报
export interface WorldState {
    year: number;
    seasonIndex: number;
    turn: number;
    cities: CityState[];
    /** 全体将领运行态（含敌方），忠诚度变化在此结算 */
    generals: GeneralState[];
    /** 唐室对外关系（玩家视角），存档 v2 起持久化 */
    diplomacy: DiplomacyState;
    /** 进行中的行军令（调兵/出征） */
    marches: MarchOrder[];
    /** 难度分级：影响群雄攻性与经济；存档 v2 起持久化，旧档缺省 standard */
    difficulty: DifficultyId;
    flags: Record<string, boolean | number>; // 历史分支 / once 触发标志
    log: string[];
}

export function createWorld(
    year: number,
    cities: CityState[],
    generals: GeneralState[] = [],
    diplomacy?: DiplomacyState,
    marches: MarchOrder[] = [],
    difficulty: DifficultyId = 'normal'
): WorldState {
    return {
        year,
        seasonIndex: 2,
        turn: 0,
        cities,
        generals,
        diplomacy: diplomacy ?? { relations: {}, allies: [], atWar: [] },
        marches,
        difficulty,
        flags: {},
        log: []
    };
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