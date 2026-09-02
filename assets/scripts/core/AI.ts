import type { WorldState } from './WorldState';
import { factionPower } from './WorldState';
import { getFaction } from '../data/Factions';
import { neighborsOf } from '../data/Cities';
import { resolveBattle } from './BattleSystem';
import { removeArmy } from './Army';
import { TIEBI_DEFENSE } from './TraitEffects';
import { specialtyOf } from '../data/Specialties';
import { difficultyOf } from './Difficulty';
import { isTrucedWithTang } from './AIDiplomacy';
import type { FactionPersonality } from './Types';

export type AiActionKind = 'expand' | 'reinforce';

export interface AiAction {
    faction: string;
    kind: AiActionKind;
    targetCityId?: string;
    /** 远征出发城（expanding 时由 decideFactions 选定，兵源所在） */
    sourceCityId?: string;
    detail: string;
}

// 各性格进取概率（决定扩张 vs 陈兵养锐）
const EXPAND_CHANCE: Record<FactionPersonality, number> = {
    aggressive: 0.55,
    expansionist: 0.45,
    scheming: 0.35,
    defensive: 0.15
};

/** 远征发兵比例：势力从出发城抽调六成兵力，留守四成。 */
const EXPEDITION_RATIO = 0.6;
/** 发兵门槛：出发城至少要留有此数的远征兵力才敢动兵。 */
const EXPEDITION_MIN_TROOPS = 1500;

/** 找出势力边境上的可攻敌城（邻接他势之城），综合城防/守军取最弱者。
 *  onlyFaction：只考虑该势力之城（合纵成员优先攻打盟主）；
 *  excludeFactions：跳过这些势力之城（与唐停战者不攻唐土）。 */
function adjacentTarget(world: WorldState, faction: string, onlyFaction?: string, excludeFactions?: ReadonlySet<string>): { id: string; name: string } | null {
    let best: { id: string; name: string; defense: number; army: number } | null = null;
    for (const own of world.cities) {
        if (own.faction !== faction) {
            continue;
        }
        for (const n of neighborsOf(own.id)) {
            const target = world.cities.find((c) => c.id === n.id);
            if (!target || target.faction === faction) {
                continue;
            }
            if (onlyFaction && target.faction !== onlyFaction) {
                continue;
            }
            if (excludeFactions && excludeFactions.has(target.faction)) {
                continue;
            }
            const better = !best
                || target.defense < best.defense
                || (target.defense === best.defense && target.army < best.army);
            if (better) {
                best = { id: target.id, name: target.name, defense: target.defense, army: target.army };
            }
        }
    }
    return best ? { id: best.id, name: best.name } : null;
}

/** 为攻取目标城选择兵力最雄厚的相邻己方城作为远征出发地。 */
function expeditionSource(world: WorldState, faction: string, targetId: string): string | null {
    let bestId: string | null = null;
    let bestArmy = 0;
    for (const own of world.cities) {
        if (own.faction !== faction || own.army <= 0) {
            continue;
        }
        if (!neighborsOf(own.id).some((n) => n.id === targetId)) {
            continue;
        }
        if (own.army > bestArmy) {
            bestArmy = own.army;
            bestId = own.id;
        }
    }
    return bestArmy >= EXPEDITION_MIN_TROOPS ? bestId : null;
}

/** 势力是否为边境城（存在相邻他势之城）。 */
function isBorderCity(world: WorldState, cityFaction: string, cityId: string): boolean {
    return neighborsOf(cityId).some((n) => {
        const c = world.cities.find((item) => item.id === n.id);
        return c != null && c.faction !== cityFaction;
    });
}

export function decideFactions(world: WorldState, rng?: () => number): AiAction[] {
    const rand = rng ?? Math.random;
    const actions: AiAction[] = [];
    const factions = new Set<string>();
    for (const c of world.cities) {
        factions.add(c.faction);
    }
    for (const f of factions) {
        if (f === 'tang') {
            continue; // 玩家由人操控
        }
        const def = getFaction(f);
        if (factionPower(world, f) <= 0) {
            continue;
        }
        const charm = EXPAND_CHANCE[def.personality] * difficultyOf(world.difficulty).aiAggression;
        // 与唐停战者不攻唐土；唐之盟邦亦不侵唐土（盟约的实value：安稳的侧翼）
        const protectedFactions = new Set<string>();
        if (isTrucedWithTang(world, f) || world.diplomacy.allies.includes(f)) {
            protectedFactions.add('tang');
        }
        // 合纵成员优先攻打盟主之城；无接壤盟主城再退回常规选目标
        const coalition = world.pacts.coalition;
        const inCoalition = coalition != null && coalition.members.includes(f)
            && !(coalition.target === 'tang' && protectedFactions.has('tang'));
        let target: { id: string; name: string } | null = null;
        if (inCoalition && coalition) {
            target = adjacentTarget(world, f, coalition.target);
        }
        if (!target) {
            target = adjacentTarget(world, f, undefined, protectedFactions);
        }
        const source = target ? expeditionSource(world, f, target.id) : null;
        if (rand() < charm && target && source) {
            actions.push({ faction: f, kind: 'expand', targetCityId: target.id, sourceCityId: source, detail: `${def.name}进攻${target.name}` });
        } else {
            actions.push({ faction: f, kind: 'reinforce', detail: `${def.name}陈兵养锐` });
        }
    }
    return actions;
}

export function applyAiActions(world: WorldState, actions: AiAction[], rng: () => number = Math.random): void {
    for (const a of actions) {
        if (a.kind === 'expand' && a.targetCityId && a.sourceCityId) {
            const source = world.cities.find((c) => c.id === a.sourceCityId);
            const target = world.cities.find((c) => c.id === a.targetCityId);
            if (!source || !target || source.army <= 0) {
                continue;
            }
            // 远征军：从出发城抽调六成兵力（按兵种比例），真实攻城战
            const troops = { ...source.troops };
            for (const key of Object.keys(troops) as Array<keyof typeof troops>) {
                troops[key] = Math.floor(troops[key] * EXPEDITION_RATIO);
            }
            const expeditionTotal = Object.values(troops).reduce((s, v) => s + v, 0);
            if (expeditionTotal <= 0) {
                continue;
            }
            removeArmy(source, expeditionTotal);
            const sourceGeneral = source.generalId
                ? world.generals.find((g) => g.id === source.generalId)
                : undefined;
            const targetGeneral = target.generalId
                ? world.generals.find((g) => g.id === target.generalId)
                : undefined;
            const result = resolveBattle(
                { generalCommand: sourceGeneral ? sourceGeneral.stats.command : 55, troops, trait: sourceGeneral?.trait ?? null },
                { generalCommand: targetGeneral ? targetGeneral.stats.command : 55, troops: { ...target.troops }, trait: targetGeneral?.trait ?? null },
                { cityDefense: target.defense + (targetGeneral?.trait === 'tiebi' ? TIEBI_DEFENSE : 0) + (specialtyOf(target.id) === 'pass' ? 2 : 0), rng }
            );
            removeArmy(target, result.defenderLoss);
            if (result.attackerWin) {
                target.faction = a.faction;
                // 唐土守将命运：五成走脱（卸任游历），三成被俘改旗，两成殁于阵前
                if (target.generalId) {
                    const g = world.generals.find((item) => item.id === target.generalId);
                    if (g && g.faction === 'tang') {
                        const r2 = rng();
                        if (r2 < 0.5) {
                            g.assignment = null; // 走脱，日后可再授职
                        } else if (r2 < 0.8) {
                            g.faction = a.faction;
                            g.loyalty = 40;
                            g.assignment = null;
                        } else {
                            world.generals = world.generals.filter((item) => item.id !== g.id);
                        }
                    }
                }
                target.generalId = null;
                target.defense = Math.min(target.defense, 5);
                target.morale = 60;
                // 远征军入城驻防
                for (const key of Object.keys(troops) as Array<keyof typeof troops>) {
                    target.troops[key] += troops[key];
                    target.army += troops[key];
                }
                world.log.push(`${a.detail}（守军溃散）`);
            } else {
                world.log.push(`${a.detail}，被守军击退`);
                // 攻势受挫：守军士气微振
                target.morale = Math.min(100, target.morale + 2);
            }
        } else if (a.kind === 'reinforce') {
            // 优先在边境城养锐（邻接敌城者），无边境则退回任意城
            const own = world.cities.filter((c) => c.faction === a.faction);
            const border = own.find((c) => c.gold >= 300 && isBorderCity(world, a.faction, c.id));
            const target = border ?? own.find((c) => c.gold >= 300);
            if (target) {
                target.gold -= 300;
                target.troops.fubing += 500;
                target.army += 500;
                world.log.push(a.detail);
            }
        }
    }
}