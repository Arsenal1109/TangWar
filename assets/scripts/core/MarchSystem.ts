import { TROOP_ORDER, TROOPS, type TroopType } from '../data/Troops';
import type { CityDef } from './Types';

export interface MarchOrder {
    id: string;
    fromId: string;
    toId: string;
    troops: Record<TroopType, number>;
    turnsLeft: number;
    speed: number;
}

export function dominantSpeed(troops: Record<TroopType, number>): number {
    let total = 0;
    let weighted = 0;
    for (const t of TROOP_ORDER) {
        const n = troops[t] ?? 0;
        if (n > 0) {
            total += n;
            weighted += n * TROOPS[t].speed;
        }
    }
    return total === 0 ? 1 : weighted / total;
}

export function marchTurns(from: CityDef, to: CityDef, speed: number): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    return Math.max(1, Math.ceil(dist / (40 * speed)));
}

export function createMarch(id: string, from: CityDef, to: CityDef, troops: Record<TroopType, number>): MarchOrder {
    const speed = dominantSpeed(troops);
    return {
        id,
        fromId: from.id,
        toId: to.id,
        troops,
        turnsLeft: marchTurns(from, to, speed),
        speed
    };
}

export function tickMarch(order: MarchOrder): boolean {
    order.turnsLeft -= 1;
    return order.turnsLeft <= 0;
}
