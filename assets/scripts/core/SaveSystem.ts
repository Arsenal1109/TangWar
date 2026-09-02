import type { WorldState } from './WorldState';
import type { CityState } from './ResourceSystem';
import type { TroopType } from '../data/Troops';
import type { AiPacts } from './AIDiplomacy';

export const SAVE_VERSION = 2;

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

export interface SaveGeneral {
    id: string;
    loyalty: number;
}

export interface SaveDiplomacy {
    relations: Record<string, number>;
    allies: string[];
    atWar: string[];
    marriedAllies?: string[];
}

export interface SaveMarch {
    id: string;
    fromId: string;
    toId: string;
    troops: Record<TroopType, number>;
    turnsLeft: number;
    speed: number;
    command?: number;
    faction?: string;
}

export interface SaveData {
    meta: { version: number; savedAt: string };
    year: number;
    seasonIndex: number;
    turn: number;
    flags: Record<string, boolean | number>;
    cities: SaveCity[];
    /** v2 起持久化：将领忠诚、外交关系、进行中的行军令 */
    generals?: SaveGeneral[];
    diplomacy?: SaveDiplomacy;
    marches?: SaveMarch[];
    /** v2 起可选：难度分级；旧档缺省回落标准 */
    difficulty?: string;
    /** v2 起可选：群雄外交运行态（停战/合纵）；旧档缺省空白态势 */
    pacts?: AiPacts;
    /** v2 起可选：本局史册（大事纪要）；旧档缺省空史册 */
    chronicle?: string[];
    achievements?: string[];
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
        })),
        generals: world.generals.map((g) => ({ id: g.id, loyalty: g.loyalty })),
        diplomacy: {
            relations: { ...world.diplomacy.relations },
            allies: [...world.diplomacy.allies],
            atWar: [...world.diplomacy.atWar],
            marriedAllies: [...(world.diplomacy.marriedAllies ?? [])]
        },
        marches: world.marches.map((m) => ({
            id: m.id,
            fromId: m.fromId,
            toId: m.toId,
            troops: { ...m.troops },
            turnsLeft: m.turnsLeft,
            speed: m.speed,
            command: m.command,
            faction: m.faction
        })),
        difficulty: world.difficulty,
        pacts: {
            truces: { ...world.pacts.truces },
            coalition: world.pacts.coalition
                ? { target: world.pacts.coalition.target, members: [...world.pacts.coalition.members], turnsLeft: world.pacts.coalition.turnsLeft }
                : null
        },
        chronicle: [...world.chronicle],
        achievements: [...world.achievements]
    };
}

function applyGenerals(world: WorldState, data: SaveGeneral[] | undefined): void {
    // v1 存档无将领运行态：沿用世界构造时的默认忠诚
    if (!data) {
        return;
    }
    for (const g of data) {
        const state = world.generals.find((item) => item.id === g.id);
        if (state) {
            state.loyalty = g.loyalty;
        }
    }
}

function applyDiplomacy(world: WorldState, data: SaveDiplomacy | undefined): void {
    if (!data) {
        return; // v1：保持世界构造时的默认关系
    }
    world.diplomacy.relations = { ...data.relations };
    world.diplomacy.allies = [...data.allies];
    world.diplomacy.atWar = [...data.atWar];
    world.diplomacy.marriedAllies = Array.isArray(data.marriedAllies) ? [...data.marriedAllies] : [];
}

function applyMarches(world: WorldState, data: SaveMarch[] | undefined): void {
    if (!data) {
        return; // v1：无行军令
    }
    world.marches = data.map((m) => ({
        id: m.id,
        fromId: m.fromId,
        toId: m.toId,
        troops: { ...m.troops },
        turnsLeft: m.turnsLeft,
        speed: m.speed,
        command: m.command,
        faction: m.faction
    }));
}

export function applySave(world: WorldState, data: SaveData): void {
    const version = data.meta.version;
    if (version !== 1 && version !== SAVE_VERSION) {
        throw new Error(`存档版本不兼容: ${version}`);
    }
    // v1 -> v2：城池字段结构一致，将领/外交/行军缺失时用世界默认值兜底
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
    applyGenerals(world, data.generals);
    applyDiplomacy(world, data.diplomacy);
    applyMarches(world, data.marches);
    // 旧档/异常值回落标准难度
    world.difficulty = (data.difficulty === 'easy' || data.difficulty === 'normal' || data.difficulty === 'hard')
        ? data.difficulty
        : 'normal';
    // 旧档缺省空白外交态势； coalition 结构做最小防御校验
    if (data.pacts && typeof data.pacts.truces === 'object') {
        world.pacts.truces = { ...data.pacts.truces };
        world.pacts.coalition = data.pacts.coalition
            && typeof data.pacts.coalition.target === 'string'
            && Array.isArray(data.pacts.coalition.members)
            ? { target: data.pacts.coalition.target, members: [...data.pacts.coalition.members], turnsLeft: data.pacts.coalition.turnsLeft }
            : null;
    }
    // 旧档缺省空史册
    world.chronicle = Array.isArray(data.chronicle) ? data.chronicle.filter((l) => typeof l === 'string') : [];
    world.achievements = Array.isArray(data.achievements) ? data.achievements.filter((l) => typeof l === 'string') : [];
    world.log = [];
}