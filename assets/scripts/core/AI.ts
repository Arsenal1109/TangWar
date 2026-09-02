import type { WorldState } from './WorldState';
import { factionPower } from './WorldState';
import { getFaction } from '../data/Factions';
import { neighborsOf } from '../data/Cities';
import type { FactionPersonality } from './Types';

export type AiActionKind = 'expand' | 'reinforce';

export interface AiAction {
    faction: string;
    kind: AiActionKind;
    targetCityId?: string;
    detail: string;
}

// 各性格进取概率（决定扩张 vs 陈兵养锐）
const EXPAND_CHANCE: Record<FactionPersonality, number> = {
    aggressive: 0.55,
    expansionist: 0.45,
    scheming: 0.35,
    defensive: 0.15
};

/** 找出势力边境上的可攻敌城（邻接他势之城），综合城防/守军取最弱者。 */
function adjacentTarget(world: WorldState, faction: string): { id: string; name: string } | null {
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
        const charm = EXPAND_CHANCE[def.personality];
        const target = adjacentTarget(world, f);
        if (rand() < charm && target) {
            actions.push({ faction: f, kind: 'expand', targetCityId: target.id, detail: `${def.name}进攻${target.name}` });
        } else {
            actions.push({ faction: f, kind: 'reinforce', detail: `${def.name}陈兵养锐` });
        }
    }
    return actions;
}

export function applyAiActions(world: WorldState, actions: AiAction[]): void {
    for (const a of actions) {
        if (a.kind === 'expand' && a.targetCityId) {
            const city = world.cities.find((c) => c.id === a.targetCityId);
            if (city) {
                city.faction = a.faction;
                city.generalId = null;
                city.defense = Math.min(city.defense, 5);
                world.log.push(a.detail);
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