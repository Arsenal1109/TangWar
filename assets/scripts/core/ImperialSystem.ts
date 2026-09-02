import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';

/**
 * 称帝建元：坐拥八城以上可即皇帝位，择年号而定国策。
 * 称帝震慑群雄（关系恶化、合纵更易成形），但年号红利惠及全局。
 */

export type EraId = 'wude' | 'tianshou' | 'yining';

export interface EraDef {
    id: EraId;
    name: string;
    desc: string;
}

export const ERAS: EraDef[] = [
    { id: 'wude', name: '武德', desc: '以武功定天下：即位时唐土民心 +5' },
    { id: 'tianshou', name: '天授', desc: '天命所归：此后外交行动威望 +15' },
    { id: 'yining', name: '义宁', desc: '怀柔诸侯：称帝后群雄不满减半（关系 -5）' }
];

export function eraById(id: EraId): EraDef | undefined {
    return ERAS.find((e) => e.id === id);
}

export const PROCLAIM_MIN_CITIES = 8;

export interface ProclaimResult {
    ok: boolean;
    reason: string;
    message: string;
}

/** 是否已具备称帝条件（八城且未称帝）。 */
export function canProclaim(world: WorldState): boolean {
    return !world.flags['proclaimed'] && world.cities.filter((c) => c.faction === 'tang').length >= PROCLAIM_MIN_CITIES;
}

/** 即皇帝位：择年号，定红利，群雄侧目。 */
export function proclaimEmperor(world: WorldState, eraId: EraId): ProclaimResult {
    if (world.flags['proclaimed']) {
        return { ok: false, reason: '已登大位', message: '' };
    }
    const tang = world.cities.filter((c) => c.faction === 'tang');
    if (tang.length < PROCLAIM_MIN_CITIES) {
        return { ok: false, reason: `唐土仅${tang.length}城，未足八城之数`, message: '' };
    }
    const era = eraById(eraId);
    if (!era) {
        return { ok: false, reason: '年号不明', message: '' };
    }
    world.flags['proclaimed'] = true;
    world.eraName = era.name;
    const relDelta = era.id === 'yining' ? -5 : -10;
    for (const f of Object.keys(world.diplomacy.relations)) {
        if (f !== 'tang') {
            world.diplomacy.relations[f] = Math.max(-100, (world.diplomacy.relations[f] ?? 0) + relDelta);
        }
    }
    if (era.id === 'wude') {
        for (const c of tang) {
            c.morale = Math.min(100, c.morale + 5);
        }
    }
    if (era.id === 'tianshou') {
        world.flags['eraPrestige'] = 15;
    }
    recordChronicle(world, `李渊即皇帝位，国号大唐，建元${era.name}`);
    world.log.push(`大典告成：李渊即皇帝位，国号大唐，建元${era.name}。群雄侧目。`);
    return { ok: true, reason: '', message: `李渊即皇帝位，建元${era.name}` };
}
