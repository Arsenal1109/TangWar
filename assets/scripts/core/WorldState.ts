import type { CityState } from './ResourceSystem';
import type { GeneralState } from './GeneralSystem';
import type { DiplomacyState } from './Diplomacy';
import type { MarchOrder } from './MarchSystem';
import type { DifficultyId } from './Difficulty';
import type { AiPacts } from './AIDiplomacy';
import { createAiPacts } from './AIDiplomacy';

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
    /** 群雄外交运行态：与唐停战 + 合纵盟约；存档 v2 起持久化 */
    pacts: AiPacts;
    /** 本局史册：值得铭记的大事（疆土易手/合纵/遣使/名将陨落），上限 ~120 条；存档 v2 起持久化 */
    chronicle: string[];
    /** 本局功业（成就）已解锁 id；存档 v2 起持久化 */
    achievements: string[];
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
        pacts: createAiPacts(),
        chronicle: [],
        achievements: [],
        flags: {},
        log: []
    };
}

/** 追加一条史册（带年代季节前缀），超出上限丢弃最旧的。 */
export function recordChronicle(world: WorldState, text: string): void {
    const season = ['春', '夏', '秋', '冬'][world.seasonIndex] ?? '';
    world.chronicle.push(`${world.year}年${season} · ${text}`);
    if (world.chronicle.length > 120) {
        world.chronicle.splice(0, world.chronicle.length - 120);
    }
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