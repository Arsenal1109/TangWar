import { TROOP_ORDER, TROOPS, type TroopType } from '../data/Troops';
import type { CityDef } from './Types';
import { resolveBattle } from './BattleSystem';
import { addTroops, removeArmy } from './Army';
import { getCity, isAdjacent } from '../data/Cities';
import type { WorldState } from './WorldState';

export interface MarchOrder {
    id: string;
    fromId: string;
    toId: string;
    troops: Record<TroopType, number>;
    turnsLeft: number;
    speed: number;
    /** 出征部队统率快照（离城将领的统率值），用于到达时战斗结算 */
    command?: number;
    /** 所属势力（默认唐），用于到达归属判定 */
    faction?: string;
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

export interface MarchArrival {
    marchId: string;
    toId: string;
    joined: boolean;      // true=进驻己方城池；false=与守军交战
    attackerWin: boolean;
    captured: boolean;
    message: string;
}

/**
 * 世界级行军推进：每回合所有行军令 turnsLeft-1；
 * 到达时按目的城归属分流——己方城直接并入守军；
 * 敌城则按真实战斗结算，胜利且守军残破则易主。
 * 战报写入 world.log 供「天下大事」呈现。
 */
export function tickWorldMarches(world: WorldState, rng: () => number = Math.random): MarchArrival[] {
    const arrivals: MarchArrival[] = [];
    const finished: MarchOrder[] = [];
    for (const m of world.marches) {
        m.turnsLeft -= 1;
        if (m.turnsLeft <= 0) {
            finished.push(m);
        }
    }
    world.marches = world.marches.filter((m) => m.turnsLeft > 0);

    for (const m of finished) {
        const dest = world.cities.find((c) => c.id === m.toId);
        const fromName = getCity(m.fromId).name;
        if (!dest) {
            arrivals.push({ marchId: m.id, toId: m.toId, joined: false, attackerWin: false, captured: false, message: `${fromName}行军令作废（目的城已不存在）` });
            continue;
        }
        const faction = m.faction ?? 'tang';
        if (dest.faction === faction) {
            for (const t of TROOP_ORDER) {
                addTroops(dest, t, m.troops[t] ?? 0);
            }
            const msg = `${fromName}援军进驻${dest.name}，得兵 ${TROOP_ORDER.reduce((s, t) => s + (m.troops[t] ?? 0), 0).toLocaleString()}`;
            world.log.push(msg);
            arrivals.push({ marchId: m.id, toId: m.toId, joined: true, attackerWin: true, captured: false, message: msg });
            continue;
        }
        // 敌城：攻城战
        const defCommand = dest.generalId
            ? (world.generals.find((g) => g.id === dest.generalId)?.stats.command ?? 55)
            : 55;
        const result = resolveBattle(
            { generalCommand: m.command ?? 55, troops: m.troops },
            { generalCommand: defCommand, troops: { ...dest.troops } },
            { cityDefense: dest.defense, rng }
        );
        removeArmy(dest, result.defenderLoss);
        let captured = false;
        if (result.attackerWin && (dest.army <= 800 || dest.defense <= 2)) {
            dest.faction = faction;
            dest.generalId = null;
            dest.morale = 50;
            dest.defense = 3;
            captured = true;
            for (const t of TROOP_ORDER) {
                addTroops(dest, t, Math.max(0, (m.troops[t] ?? 0) - Math.floor((m.troops[t] ?? 0) * 0.2)));
            }
        }
        const msg = result.attackerWin
            ? (captured ? `${fromName}大军攻破${dest.name}，守军溃散` : `${fromName}大军于${dest.name}城下击破守军`)
            : `${fromName}大军攻${dest.name}不克，${result.report}`;
        world.log.push(msg);
        arrivals.push({ marchId: m.id, toId: m.toId, joined: false, attackerWin: result.attackerWin, captured, message: msg });
    }
    return arrivals;
}

/** 校验行军令合法性：相邻、有兵、目的城存在。 */
export function canMarch(world: WorldState, fromId: string, toId: string): { ok: boolean; reason: string } {
    const from = world.cities.find((c) => c.id === fromId);
    const to = world.cities.find((c) => c.id === toId);
    if (!from || !to) {
        return { ok: false, reason: '城池不存在' };
    }
    if (!isAdjacent(fromId, toId)) {
        return { ok: false, reason: '两城不相邻，无法直接行军' };
    }
    if (from.army <= 0) {
        return { ok: false, reason: '城中无兵可调' };
    }
    if (fromId === toId) {
        return { ok: false, reason: '目的城与出发城相同' };
    }
    return { ok: true, reason: '' };
}
