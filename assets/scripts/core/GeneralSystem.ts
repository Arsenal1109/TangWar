import { GENERALS } from '../data/Generals';
import type { GeneralStats } from './Types';
import type { ApplyResult } from './PolicySystem';

export type GeneralRole = 'governor' | 'commander';

export interface GeneralAssignment {
    role: GeneralRole;
    cityId: string;
}

export interface GeneralState {
    id: string;
    name: string;
    title: string;
    faction: string;
    stats: GeneralStats;
    loyalty: number;
    assignment: GeneralAssignment | null;
}

export function createGeneralStates(): GeneralState[] {
    return GENERALS.map((g) => ({
        id: g.id,
        name: g.name,
        title: g.title,
        faction: g.faction,
        stats: { ...g.stats },
        loyalty: g.loyalty,
        assignment: null
    }));
}

export function getGeneralState(states: GeneralState[], id: string): GeneralState {
    const g = states.find((item) => item.id === id);
    if (!g) {
        throw new Error(`未知将领: ${id}`);
    }
    return g;
}

export function assignGeneral(g: GeneralState, cityId: string, role: GeneralRole): ApplyResult {
    if (g.assignment) {
        return { ok: false, reason: `${g.name}已有任命` };
    }
    g.assignment = { role, cityId };
    return { ok: true, reason: '' };
}

export function unassignGeneral(g: GeneralState): void {
    g.assignment = null;
}

export function changeLoyalty(g: GeneralState, delta: number): void {
    g.loyalty = Math.max(1, Math.min(100, g.loyalty + delta));
}
