import { TROOP_ORDER, TROOPS, type TroopType, isCounter } from '../data/Troops';

export interface BattleArmy {
    generalCommand: number; // 0..100
    troops: Record<TroopType, number>;
}

export interface BattleOptions {
    cityDefense?: number;   // 城防加成（每点 +5% 守方战力）
    riverPenalty?: number;  // 渡江惩罚（0..1）
    rng?: () => number;     // 注入随机源，默认 Math.random
}

export interface BattleResult {
    attackerWin: boolean;
    attackerLoss: number;
    defenderLoss: number;
    report: string;
}

function totalOf(troops: Record<TroopType, number>): number {
    return TROOP_ORDER.reduce((s, t) => s + (troops[t] ?? 0), 0);
}

function powerOf(troops: Record<TroopType, number>, command: number, offense: boolean): number {
    let power = 0;
    for (const t of TROOP_ORDER) {
        const n = troops[t] ?? 0;
        if (n <= 0) {
            continue;
        }
        power += n * (offense ? TROOPS[t].atk : TROOPS[t].def);
    }
    return power * (1 + (command / 100) * 0.5);
}

function counterBonus(att: Record<TroopType, number>, def: Record<TroopType, number>): number {
    let bonus = 0;
    for (const at of TROOP_ORDER) {
        for (const dt of TROOP_ORDER) {
            if (isCounter(at, dt)) {
                bonus += Math.min(att[at] ?? 0, def[dt] ?? 0) * 0.3 * TROOPS[at].atk;
            }
        }
    }
    return bonus;
}

export function resolveBattle(att: BattleArmy, def: BattleArmy, opts: BattleOptions = {}): BattleResult {
    const rng = opts.rng ?? Math.random;
    const r = rng(); // 0..1 胜掷
    const riverPenalty = opts.riverPenalty ?? 0;
    const cityBonus = (opts.cityDefense ?? 0) * 0.05;

    const attPower = powerOf(att.troops, att.generalCommand, true) * (1 - riverPenalty) + counterBonus(att.troops, def.troops);
    const defPower = powerOf(def.troops, def.generalCommand, false) * (1 + cityBonus);
    const attTotal = totalOf(att.troops);
    const defTotal = totalOf(def.troops);

    const attWinProb =
        attTotal <= 0 ? 0 :
        defTotal <= 0 ? 1 :
        attPower / (attPower + defPower);
    const attackerWin = r < attWinProb;

    const winnerPower = attackerWin ? attPower : defPower;
    const loserPower = attackerWin ? defPower : attPower;
    const ratio = Math.min(1, loserPower / Math.max(1, winnerPower));
    const luck = 0.9 + r * 0.2; // 0.9..1.1，用于伤亡浮动

    let attackerLoss: number;
    let defenderLoss: number;
    if (attackerWin) {
        attackerLoss = Math.round(attTotal * (0.1 + ratio * 0.2) * luck);
        defenderLoss = Math.round(defTotal * (0.3 + ratio * 0.5));
    } else {
        attackerLoss = Math.round(attTotal * (0.2 + ratio * 0.7) * luck);
        defenderLoss = Math.round(defTotal * (0.1 + ratio * 0.2));
    }

    const report = attackerWin
        ? `大破守军，斩获 ${defenderLoss}，自损 ${attackerLoss}`
        : `攻势受挫，损兵 ${attackerLoss}，敌损 ${defenderLoss}`;

    return { attackerWin, attackerLoss, defenderLoss, report };
}
