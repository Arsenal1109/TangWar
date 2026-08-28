import { FACTIONS } from '../data/Factions';

export interface DiplomacyState {
    relations: Record<string, number>; // -100..100
    allies: string[];
    atWar: string[];
}

export type DiploAction = 'alliance' | 'truce' | 'tribute' | 'marriage' | 'threaten';

export interface DiploCtx {
    gold: number;
    prestige: number;   // 0..100 威望
    armyPower: number;  // 兵力
    rng?: () => number;
}

export interface DiploResult {
    ok: boolean;
    reason: string;
    goldCost: number;
    relationsDelta: number;
    message: string;
}

function clampRel(v: number): number {
    return Math.max(-100, Math.min(100, v));
}

export function createDiplomacyState(playerFaction = 'tang'): DiplomacyState {
    const relations: Record<string, number> = {};
    for (const f of FACTIONS) {
        if (f.id !== playerFaction) {
            relations[f.id] = 0;
        }
    }
    relations.sui = -60;  // 隋室敌对
    relations.liu = -40;  // 刘武周交战
    relations.wa = 20;    // 瓦岗中立偏善
    relations.xia = 0;
    relations.zheng = 0;
    relations.chu = 0;
    relations.qin = 0;
    relations.liang = 0;
    relations.yan = 0;
    relations.wu = 0;
    relations.shen = 0;
    relations.lin = 0;
    return { relations, allies: [], atWar: ['sui', 'liu'] };
}

export function performDiplo(
    state: DiplomacyState,
    selfFaction: string,
    targetFaction: string,
    action: DiploAction,
    ctx: DiploCtx
): DiploResult {
    const rng = ctx.rng ?? Math.random;
    const r = rng();
    const rel = state.relations[targetFaction] ?? 0;
    const base = 0.5 + ctx.prestige / 200;

    switch (action) {
        case 'alliance': {
            if (ctx.gold < 200) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            const prob = Math.min(0.95, base + rel / 200);
            if (r < prob) {
                state.relations[targetFaction] = clampRel(rel + 20);
                if (!state.allies.includes(targetFaction)) {
                    state.allies.push(targetFaction);
                }
                return { ok: true, reason: '', goldCost: 200, relationsDelta: 20, message: `与 ${targetFaction} 结盟` };
            }
            return { ok: false, reason: '对方拒绝结盟', goldCost: 200, relationsDelta: -10, message: '结盟被拒，关系受挫' };
        }
        case 'truce': {
            if (ctx.gold < 100) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            const prob = Math.min(0.9, base + rel / 200);
            if (r < prob) {
                state.atWar = state.atWar.filter((f) => f !== targetFaction);
                state.relations[targetFaction] = clampRel(rel + 10);
                return { ok: true, reason: '', goldCost: 100, relationsDelta: 10, message: `与 ${targetFaction} 停战` };
            }
            return { ok: false, reason: '对方拒绝停战', goldCost: 100, relationsDelta: -5, message: '停战被拒' };
        }
        case 'tribute': {
            if (ctx.gold < 300) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            state.relations[targetFaction] = clampRel(rel + 30);
            return { ok: true, reason: '', goldCost: 300, relationsDelta: 30, message: `向 ${targetFaction} 进贡` };
        }
        case 'marriage': {
            if (ctx.gold < 500) {
                return { ok: false, reason: '黄金不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            if (ctx.prestige < 60) {
                return { ok: false, reason: '威望不足', goldCost: 0, relationsDelta: 0, message: '' };
            }
            state.relations[targetFaction] = clampRel(rel + 50);
            if (!state.allies.includes(targetFaction)) {
                state.allies.push(targetFaction);
            }
            return { ok: true, reason: '', goldCost: 500, relationsDelta: 50, message: `与 ${targetFaction} 和亲结盟` };
        }
        case 'threaten': {
            const prob = Math.min(0.95, 0.3 + ctx.armyPower / 100000 + ctx.prestige / 300);
            if (r < prob) {
                state.relations[targetFaction] = clampRel(rel - 20);
                return { ok: true, reason: '', goldCost: 0, relationsDelta: -20, message: `威慑 ${targetFaction}，其惧而降望` };
            }
            state.atWar.push(targetFaction);
            return { ok: false, reason: '对方不服，反致开战', goldCost: 0, relationsDelta: -30, message: `${targetFaction} 奋起反抗，两国交兵` };
        }
        default:
            return { ok: false, reason: '未知行动', goldCost: 0, relationsDelta: 0, message: '' };
    }
}
