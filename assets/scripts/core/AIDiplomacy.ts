import type { WorldState } from './WorldState';
import { factionPower, citiesOf, recordChronicle } from './WorldState';
import { getFaction } from '../data/Factions';
import { difficultyOf } from './Difficulty';
import { sowDiscord, spreadRumor } from './Stratagem';
import type { GeneralState } from './GeneralSystem';

/**
 * 群雄外交运行态（引擎无关）：
 * - truces：各势力与唐的停战剩余回合（>0 时该势力不攻唐土）；
 * - coalition：弱势群雄针对最强势力（含唐）的合纵，成员优先攻打盟主之城。
 * 存档 v2 起持久化；旧档缺省为空白态势。
 */
export interface AiPacts {
    truces: Record<string, number>;
    coalition: { target: string; members: string[]; turnsLeft: number } | null;
}

export function createAiPacts(): AiPacts {
    return { truces: {}, coalition: null };
}

export type EnvoyKind = 'peace' | 'demand';

/** 遣使要约：求和（免金修好）或勒索（纳金买停战）。 */
export interface EnvoyOffer {
    faction: string;
    kind: EnvoyKind;
    /** demand：索要的黄金数 */
    gold?: number;
    /** 接受后的停战回合数 */
    truceTurns: number;
    message: string;
}

export interface EnvoyResolution {
    ok: boolean;
    message: string;
}

/** 合纵触发：最强势力占比阈值 */
const COALITION_SHARE = 0.32;
const COALITION_TURNS = 6;
/** 求和/勒索参数 */
const PEACE_TRUCE_TURNS = 8;
const DEMAND_TRUCE_TURNS = 6;
const DEMAND_GOLD = 300;

/** 回合开始时递减停战与合纵计时。 */
export function tickPacts(world: WorldState): void {
    const truces = world.pacts.truces;
    for (const f of Object.keys(truces)) {
        truces[f] -= 1;
        if (truces[f] <= 0) {
            delete truces[f];
        }
    }
    if (world.pacts.coalition) {
        world.pacts.coalition.turnsLeft -= 1;
        if (world.pacts.coalition.turnsLeft <= 0) {
            world.log.push('合纵盟约期满，各路自散');
            world.pacts.coalition = null;
        }
    }
}

/** 势力是否与唐停战中（不攻唐土）。 */
export function isTrucedWithTang(world: WorldState, faction: string): boolean {
    return (world.pacts.truces[faction] ?? 0) > 0;
}

function activeAiFactions(world: WorldState): string[] {
    const set = new Set<string>();
    for (const c of world.cities) {
        if (c.faction !== 'tang') {
            set.add(c.faction);
        }
    }
    return [...set].filter((f) => factionPower(world, f) > 0);
}

/** 全场最强势力（含唐）。 */
function dominantFaction(world: WorldState): { id: string; power: number } | null {
    const set = new Set<string>(world.cities.map((c) => c.faction));
    let best: { id: string; power: number } | null = null;
    for (const f of set) {
        const power = factionPower(world, f);
        if (!best || power > best.power) {
            best = { id: f, power };
        }
    }
    return best;
}

function clampRel(v: number): number {
    return Math.max(-100, Math.min(100, v));
}

/**
 * 每回合的外交推演（在 AI 行动之后调用）：
 * 1) 合纵：无盟约时，若最强势力占比超阈值，最弱两家有概率歃血结盟 N 回合；
 * 2) 遣使：每回合至多一路——弱势势力求和；虎狼难度下强权有概率勒索。
 * 返回需要玩家抉择的要约（无则 null）；势力间动作直接写 world.log。
 */
export function updateAiDiplomacy(world: WorldState, rng: () => number): EnvoyOffer | null {
    // —— 1) 合纵 ——
    const totalPower = world.cities.reduce((s, c) => s + c.army, 0);
    const dom = dominantFaction(world);
    // 称帝者众矢之的：合纵阈值降至八成
    const share = world.flags['proclaimed'] ? COALITION_SHARE * 0.8 : COALITION_SHARE;
    if (!world.pacts.coalition && dom && totalPower > 0 && dom.power >= totalPower * share) {
        // 盟约的实value：唐之盟邦绝不加入讨唐合纵
        const exclude = dom.id === 'tang' ? new Set(world.diplomacy.allies) : new Set<string>();
        const others = activeAiFactions(world)
            .filter((f) => f !== dom.id)
            .filter((f) => !exclude.has(f))
            .map((f) => ({ id: f, power: factionPower(world, f) }))
            .sort((a, b) => a.power - b.power);
        if (others.length >= 2) {
            const hardBonus = world.difficulty === 'hard' ? 0.1 : 0;
            if (rng() < 0.15 + hardBonus) {
                const members = others.slice(0, 2).map((o) => o.id);
                world.pacts.coalition = { target: dom.id, members, turnsLeft: COALITION_TURNS };
                const names = members.map((m) => getFaction(m).name).join('、');
                const domName = getFaction(dom.id).name;
                world.log.push(`合纵：${names}歃血为盟，共讨${domName}`);
            }
        }
    }

    // —— 2) 遣使（至多一路；求和优先于勒索） ——
    const tangPower = factionPower(world, 'tang');
    // 求和：只剩孤城或兵力远逊于唐者
    const suitors = activeAiFactions(world).filter((f) => {
        if (isTrucedWithTang(world, f)) {
            return false;
        }
        const lonely = citiesOf(world, f).length <= 1;
        return lonely && factionPower(world, f) < tangPower * 0.6;
    });
    if (suitors.length > 0 && rng() < 0.5) {
        const f = suitors[Math.floor(rng() * suitors.length) % suitors.length];
        return {
            faction: f,
            kind: 'peace',
            truceTurns: PEACE_TRUCE_TURNS,
            message: `${getFaction(f).name}遣使入长安，愿奉表修好、罢兵八季，只求唐军不渡。`
        };
    }

    // 勒索：虎狼难度下，强势群雄仗兵威索要岁币
    if (world.difficulty === 'hard') {
        const aggressors = activeAiFactions(world).filter((f) => {
            if (isTrucedWithTang(world, f)) {
                return false;
            }
            return tangPower > 0 && factionPower(world, f) > tangPower * 0.8;
        });
        if (aggressors.length > 0 && rng() < 0.12 * difficultyOf(world.difficulty).aiAggression) {
            const f = aggressors[Math.floor(rng() * aggressors.length) % aggressors.length];
            return {
                faction: f,
                kind: 'demand',
                gold: DEMAND_GOLD,
                truceTurns: DEMAND_TRUCE_TURNS,
                message: `${getFaction(f).name}陈兵境上，遣使索岁币${DEMAND_GOLD}金；允则六季不犯，拒则兵戈相见。`
            };
        }
    }
    return null;
}

/**
 * 虎狼暗计：虎狼难度下强势群雄有几率对唐施展离间/谣言（不动玩家资源，只伤将领忠诚与城心）。
 * 返回战报行（无动作则空数组）。
 */
export function applyAiSchemes(world: WorldState, rng: () => number): string[] {
    if (world.difficulty !== 'hard') {
        return [];
    }
    const tangPower = factionPower(world, 'tang');
    if (tangPower <= 0) {
        return [];
    }
    const schemers = activeAiFactions(world).filter((f) => {
        if (isTrucedWithTang(world, f)) {
            return false;
        }
        return factionPower(world, f) > tangPower * 0.6; // 有实力才玩阴的
    });
    if (schemers.length === 0 || rng() >= 0.18 * difficultyOf(world.difficulty).aiAggression) {
        return [];
    }
    const f = schemers[Math.floor(rng() * schemers.length) % schemers.length];
    const name = getFaction(f).name;
    // 二选一：离间守将（有守将的唐城）或谣言扰民
    const garrisoned = world.cities.filter((c) => c.faction === 'tang' && c.generalId);
    const useDiscord = garrisoned.length > 0 && rng() < 0.5;
    if (useDiscord) {
        const city = garrisoned[Math.floor(rng() * garrisoned.length) % garrisoned.length];
        const general: GeneralState | undefined = world.generals.find((g) => g.id === city.generalId);
        if (!general) {
            return [];
        }
        const result = sowDiscord(general, 75, 200, rng); // 敌谋士按 75 谋略计，耗其府库 200 金
        if (result.ok) {
            const msg = `${name}施离间计，${general.name}忠诚下降`;
            world.log.push(msg);
            return [msg];
        }
        const fail = `${name}谋离间${general.name}，事泄不成`;
        world.log.push(fail);
        return [fail];
    }
    const cities = citiesOf(world, 'tang');
    if (cities.length === 0) {
        return [];
    }
    const city = cities[Math.floor(rng() * cities.length) % cities.length];
    const result = spreadRumor(city.morale, 75, 120, rng);
    if (result.ok && result.moraleDelta) {
        city.morale = Math.max(0, city.morale + result.moraleDelta);
        const msg = `${name}散布流言，${city.name}民心动摇`;
        world.log.push(msg);
        return [msg];
    }
    const fail = `${name}遣细作散布流言，被${city.name}百姓识破`;
    world.log.push(fail);
    return [fail];
}

/** 玩家对要约的抉择：接受/回绝，直接结算停战、纳贡与邦交。 */
export function resolveEnvoy(world: WorldState, offer: EnvoyOffer, accept: boolean): EnvoyResolution {
    const name = getFaction(offer.faction).name;
    const relations = world.diplomacy.relations;
    if (offer.kind === 'peace') {
        if (accept) {
            world.pacts.truces[offer.faction] = offer.truceTurns;
            relations[offer.faction] = clampRel((relations[offer.faction] ?? 0) + 15);
            const msg = `唐庭允和，与${name}罢兵${offer.truceTurns}季`;
            world.log.push(msg);
            recordChronicle(world, msg);
            return { ok: true, message: msg };
        }
        relations[offer.faction] = clampRel((relations[offer.faction] ?? 0) - 10);
        const msg = `唐庭回绝${name}求和，来使赧然而退`;
        world.log.push(msg);
        recordChronicle(world, msg);
        return { ok: false, message: msg };
    }
    // demand
    if (accept) {
        const tangGold = citiesOf(world, 'tang').reduce((s, c) => s + c.gold, 0);
        const cost = offer.gold ?? DEMAND_GOLD;
        if (tangGold < cost) {
            const msg = `唐库黄金不足${cost}，岁币未付，${name}使团空手而归`;
            world.log.push(msg);
            return { ok: false, message: msg };
        }
        let need = cost;
        const cities = citiesOf(world, 'tang').sort((a, b) => b.gold - a.gold);
        for (const c of cities) {
            const pay = Math.min(c.gold, need);
            c.gold -= pay;
            need -= pay;
            if (need <= 0) {
                break;
            }
        }
        world.pacts.truces[offer.faction] = offer.truceTurns;
        relations[offer.faction] = clampRel((relations[offer.faction] ?? 0) + 10);
        const msg = `唐庭纳岁币${cost}金，${name}许六季不犯`;
        world.log.push(msg);
        recordChronicle(world, msg);
        return { ok: true, message: msg };
    }
    relations[offer.faction] = clampRel((relations[offer.faction] ?? 0) - 20);
    const msg = `唐庭拒纳岁币，${name}怀恨引兵而去`;
    world.log.push(msg);
    recordChronicle(world, msg);
    return { ok: false, message: msg };
}
