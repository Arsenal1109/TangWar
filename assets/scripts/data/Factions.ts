import type { FactionDef } from '../core/Types';

export const FACTIONS: FactionDef[] = [
    { id: 'tang', name: '大唐·李渊', color: '#b03a2e', personality: 'aggressive' },
    { id: 'sui', name: '隋·杨广', color: '#a8862e', personality: 'defensive' },
    { id: 'wa', name: '瓦岗·李密', color: '#2e7d32', personality: 'aggressive' },
    { id: 'zheng', name: '郑·王世充', color: '#d35400', personality: 'scheming' },
    { id: 'xia', name: '夏·窦建德', color: '#2f6f9f', personality: 'expansionist' },
    { id: 'chu', name: '楚·萧铣', color: '#7d4a9a', personality: 'defensive' },
    { id: 'qin', name: '秦·薛举', color: '#8a4a2a', personality: 'aggressive' },
    { id: 'liang', name: '凉·李轨', color: '#5b7a7a', personality: 'defensive' },
    { id: 'liu', name: '定杨·刘武周', color: '#3f4a5a', personality: 'aggressive' },
    { id: 'yan', name: '燕·高开道', color: '#1c8a7a', personality: 'defensive' },
    { id: 'wu', name: '吴·杜伏威', color: '#3a8f5f', personality: 'expansionist' },
    { id: 'shen', name: '梁·沈法兴', color: '#a05a30', personality: 'defensive' },
    { id: 'lin', name: '林·林士弘', color: '#6b7d2e', personality: 'defensive' }
];

export function getFaction(id: string): FactionDef {
    const f = FACTIONS.find((item) => item.id === id);
    if (!f) {
        throw new Error(`未知势力: ${id}`);
    }
    return f;
}
