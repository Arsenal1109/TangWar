import { GENERALS } from '../data/Generals';
import type { WorldState } from './WorldState';
import { recordChronicle, citiesOf } from './WorldState';
import { getFaction } from '../data/Factions';
import type { GeneralState } from './GeneralSystem';

/**
 * 求贤与叛离（引擎无关）：
 * - 在野豪杰（faction 'none'）可耗金延请，入唐后忠诚视国势而定；
 * - 每年冬末结算忠诚：敌将离心可弃暗投明，唐将怀怨亦会叛逃——
 *   与玩家的离间/收买计策构成「谍报 → 离心 → 来投」闭环。
 */

/** 叛离判定阈值：忠诚低于此值者年末动摇 */
export const LOYALTY_RISK_THRESHOLD = 40;

/** 在野豪杰（尚未被任何一方延请）。 */
export function availableTalents(world: WorldState): GeneralState[] {
    return world.generals.filter((g) => g.faction === 'none');
}

/** 延请费用：基础 300 + 五维均值 ×4（王佐之才千金难求）。 */
export function recruitCost(g: GeneralState): number {
    const avg = (g.stats.command + g.stats.politics + g.stats.strategy + g.stats.valor + g.stats.prestige) / 5;
    return Math.round(300 + avg * 4);
}

/** 从唐土诸城扣金（先富后贫）；不足返回 false。 */
function payGold(world: WorldState, cost: number): boolean {
    const cities = citiesOf(world, 'tang').sort((a, b) => b.gold - a.gold);
    const total = cities.reduce((s, c) => s + c.gold, 0);
    if (total < cost) {
        return false;
    }
    let need = cost;
    for (const c of cities) {
        const pay = Math.min(c.gold, need);
        c.gold -= pay;
        need -= pay;
        if (need <= 0) {
            break;
        }
    }
    return true;
}

export interface RecruitResult {
    ok: boolean;
    message: string;
}

/** 延请在野豪杰：扣金、改旗、定忠诚、记史册。 */
export function recruitTalent(world: WorldState, generalId: string): RecruitResult {
    const g = world.generals.find((item) => item.id === generalId);
    if (!g || g.faction !== 'none') {
        return { ok: false, message: '此人已有所属，无从延请' };
    }
    const cost = recruitCost(g);
    if (!payGold(world, cost)) {
        return { ok: false, message: `延请${g.name}需黄金${cost}，府库不足` };
    }
    g.faction = 'tang';
    // 忠诚随唐室声势：城多则安心，孤城则观望
    const tangCities = citiesOf(world, 'tang').length;
    g.loyalty = Math.max(55, Math.min(90, 55 + tangCities * 3));
    const msg = `${g.name}应求贤之聘，仗策归唐（耗金${cost}）`;
    world.log.push(msg);
    recordChronicle(world, msg);
    world.flags['recruits'] = (Number(world.flags['recruits']) || 0) + 1;
    return { ok: true, message: msg };
}

/** 求贤令：每年正月提示在野贤才（写入战报，指引玩家去图鉴延请）。 */
export function announceTalents(world: WorldState): void {
    const talents = availableTalents(world);
    if (talents.length === 0) {
        return;
    }
    const names = talents.slice(0, 3).map((g) => g.name).join('、');
    world.log.push(`求贤令：闻${names}${talents.length > 3 ? '等' : ''}贤才在野，可往图鉴延请`);
}

export interface DefectionEvent {
    general: string;
    kind: 'joins-tang' | 'flees-tang' | 'flees-player';
    message: string;
}

/**
 * 年末忠诚结算（冬季末调用）：
 * - 敌将忠诚 < 40：以 (40-忠诚)/80 的概率弃暗投明；忠诚 < 15 则遁走离场；
 * - 唐将忠诚 < 40：以 (40-忠诚)/80 的概率叛唐投奔随机敌对势力。
 * 返回事件列表（已写 log + 史册）。
 */
export function resolveLoyaltyTurnover(world: WorldState, rng: () => number): DefectionEvent[] {
    const events: DefectionEvent[] = [];
    for (const g of [...world.generals]) {
        if (g.faction === 'none') {
            continue; // 在野者无忠诚可言
        }
        if (g.loyalty >= LOYALTY_RISK_THRESHOLD) {
            continue;
        }
        const chance = (LOYALTY_RISK_THRESHOLD - g.loyalty) / 80;
        if (rng() >= chance) {
            continue;
        }
        const garrison = world.cities.find((c) => c.generalId === g.id);
        if (g.faction === 'tang') {
            // 唐将叛逃：投奔随机活跃敌对势力
            const enemies = [...new Set(world.cities.map((c) => c.faction))].filter((f) => f !== 'tang' && f !== 'none');
            const active = enemies.filter((f) => citiesOf(world, f).length > 0);
            if (active.length === 0) {
                continue;
            }
            const to = active[Math.floor(rng() * active.length) % active.length];
            g.faction = to;
            g.loyalty = 55;
            if (garrison) {
                garrison.generalId = null;
            }
            const msg = `${g.name}心怀怨望，叛唐而投${getFaction(to).name}`;
            world.log.push(msg);
            recordChronicle(world, msg);
            events.push({ general: g.id, kind: 'flees-player', message: msg });
        } else if (g.loyalty < 15) {
            // 心灰意冷：遁入山林，从此隐姓埋名
            if (garrison) {
                garrison.generalId = null;
            }
            world.generals = world.generals.filter((item) => item.id !== g.id);
            const msg = `${g.name}心灰意冷，挂印而去，遁入山林`;
            world.log.push(msg);
            recordChronicle(world, msg);
            events.push({ general: g.id, kind: 'flees-tang', message: msg });
        } else if (citiesOf(world, 'tang').length > 0) {
            // 弃暗投明：率部归唐
            g.faction = 'tang';
            g.loyalty = 65;
            const msg = `${g.name}弃暗投明，仗策来投`;
            world.log.push(msg);
            recordChronicle(world, msg);
            events.push({ general: g.id, kind: 'joins-tang', message: msg });
        }
    }
    return events;
}

/** 图鉴/序章用：某将领的延请资格与费用。 */
export function talentOffer(world: WorldState, generalId: string): { available: boolean; cost: number } {
    const g = world.generals.find((item) => item.id === generalId);
    if (!g || g.faction !== 'none') {
        return { available: false, cost: 0 };
    }
    return { available: true, cost: recruitCost(g) };
}

/** 在野豪杰 id 清单（数据层，供测试与 UI 文案）。 */
export function wandererDefs(): typeof GENERALS {
    return GENERALS.filter((g) => g.faction === 'none');
}
