import type { WorldState } from './WorldState';
import { factionPower } from './WorldState';
import { getFaction } from '../data/Factions';
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
        const enemies = [...factions].filter((e) => e !== f);
        if (enemies.length === 0) {
            continue;
        }
        const weakest = enemies.reduce((a, b) =>
            factionPower(world, a) <= factionPower(world, b) ? a : b
        );
        const weakestCities = world.cities.filter((c) => c.faction === weakest);
        if (weakestCities.length === 0) {
            continue;
        }
        if (rand() < charm) {
            const target = [...weakestCities].sort((x, y) => x.defense - y.defense)[0];
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
            for (const c of world.cities) {
                if (c.faction === a.faction && c.gold >= 200) {
                    c.gold -= 200;
                    c.troops.fubing += 500;
                    c.army += 500;
                    world.log.push(a.detail);
                    break; // 每势每回合至多一城养锐，避免金币被掏空
                }
            }
        }
    }
}