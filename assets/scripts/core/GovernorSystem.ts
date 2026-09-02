import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';
import { raidOdds, executeCouncilOrder } from './CommandSystem';

/**
 * 都督府：委任都督坐镇方面，每季自决出讨。
 * 胜算六成以上即挥师——不必事事御驾亲征；但粮秣自筹，胜负自负。
 */

/** 都督人数上限 */
export const DUYUN_MAX = 2;
/** 自动出讨的胜算门槛（%） */
export const DUYUN_ODDS = 60;

export interface DuyunAppointResult {
    ok: boolean;
    reason: string;
    message: string;
}

/** 某城现任都督（无则 null）。 */
export function duyunOf(world: WorldState, cityId: string): string | null {
    return world.duyuns?.[cityId] ?? null;
}

/** 全体都督（城 id → 都督 id）。 */
export function duyunsOf(world: WorldState): Record<string, string> {
    return world.duyuns ?? {};
}

/** 委任都督：唐城且城中将领已授职（assignment 在此城）方可拜将。 */
export function appointDuyun(world: WorldState, cityId: string, generalId: string): DuyunAppointResult {
    const city = world.cities.find((c) => c.id === cityId);
    if (!city || city.faction !== 'tang') {
        return { ok: false, reason: '非唐土之城', message: '' };
    }
    const g = world.generals.find((item) => item.id === generalId);
    if (!g || g.faction !== 'tang') {
        return { ok: false, reason: '非唐营将领', message: '' };
    }
    if (g.assignment?.cityId !== cityId) {
        return { ok: false, reason: '须先授职驻于此城，方可拜都督', message: '' };
    }
    const current = duyunsOf(world);
    if (Object.values(current).includes(generalId)) {
        return { ok: false, reason: '此将已是都督', message: '' };
    }
    if (Object.keys(current).length >= DUYUN_MAX && !current[cityId]) {
        return { ok: false, reason: `都督府已满（至多${DUYUN_MAX}员）`, message: '' };
    }
    if (!world.duyuns) world.duyuns = {};
    world.duyuns[cityId] = generalId;
    world.log.push(`拜${g.name}为${city.name}都督，假节钺，专征伐`);
    return { ok: true, reason: '', message: `${g.name}拜${city.name}都督` };
}

/** 罢都督。 */
export function removeDuyun(world: WorldState, cityId: string): DuyunAppointResult {
    const duyunId = duyunOf(world, cityId);
    if (!duyunId) {
        return { ok: false, reason: '此城无都督', message: '' };
    }
    const g = world.generals.find((item) => item.id === duyunId);
    delete world.duyuns![cityId];
    if (world.duyuns && Object.keys(world.duyuns).length === 0) world.duyuns = {};
    world.log.push(`${g?.name ?? duyunId}卸任${world.cities.find((c) => c.id === cityId)?.name ?? ''}都督`);
    return { ok: true, reason: '', message: `${g?.name ?? ''}卸任都督` };
}

/**
 * 每季都督自决出讨：胜算 ≥ 60% 即突袭（自耗粮 400，不占军议）。
 * 返回战报行（含军令成败），供回合播报。
 */
export function runDuyunCampaigns(world: WorldState, rng: () => number): string[] {
    const lines: string[] = [];
    const entries = Object.entries(duyunsOf(world));
    for (const [cityId, generalId] of entries) {
        const city = world.cities.find((c) => c.id === cityId);
        const g = world.generals.find((item) => item.id === generalId);
        // 都督失效守则：城池易主 / 都督离营或叛离 → 府除名
        if (!city || city.faction !== 'tang' || !g || g.faction !== 'tang' || g.assignment?.cityId !== cityId) {
            removeDuyun(world, cityId);
            continue;
        }
        const odds = raidOdds(world, cityId);
        if (odds < DUYUN_ODDS) {
            continue;
        }
        if (city.food < 400) {
            lines.push(`${city.name}都督${g.name}欲出师，粮秣不继，按兵未动`);
            continue;
        }
        const out = executeCouncilOrder(world, 'raid', cityId, rng);
        lines.push(`${city.name}都督${g.name}自决出讨——${out.ok ? out.body : out.reason}`);
        if (out.ok && out.raidTargetId && out.body.includes('已入版图')) {
            recordChronicle(world, `${g.name}都督出讨，克${out.raidTargetId === cityId ? '' : ''}${world.cities.find((c) => c.id === out.raidTargetId)?.name ?? '敌城'}`);
        }
    }
    return lines;
}
