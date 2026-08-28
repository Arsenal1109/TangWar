import type { CityState } from './ResourceSystem';
import type { ApplyResult } from './PolicySystem';

export type FacilityType = 'farm' | 'market' | 'barracks' | 'granary';

export const FACILITY_MAX = 3;

export function facilityName(t: FacilityType): string {
    switch (t) {
        case 'farm': return '农田';
        case 'market': return '商市';
        case 'barracks': return '兵营';
        case 'granary': return '仓廪';
    }
}

export function facilityCost(t: FacilityType, level: number): number {
    return 300 + level * 200;
}

export function buildFacility(city: CityState, type: FacilityType): ApplyResult {
    const cur = city.facilities[type];
    if (cur >= FACILITY_MAX) {
        return { ok: false, reason: `${facilityName(type)}已到最高等级` };
    }
    const cost = facilityCost(type, cur);
    if (city.gold < cost) {
        return { ok: false, reason: '黄金不足' };
    }
    city.gold -= cost;
    city.facilities[type] += 1;
    return { ok: true, reason: '' };
}
