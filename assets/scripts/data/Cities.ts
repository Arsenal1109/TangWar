import type { CityDef } from '../core/Types';

export const CITIES: CityDef[] = [
    { id: 'taiyuan', name: '太原', x: 298, y: 215, faction: 'tang', tier: 1 },
    { id: 'jinyang', name: '晋阳', x: 318, y: 228, faction: 'tang', tier: 0 },
    { id: 'changan', name: '长安', x: 270, y: 275, faction: 'tang', tier: 1 },
    { id: 'jiangdu', name: '江都', x: 360, y: 318, faction: 'sui', tier: 1 },
    { id: 'luoyang', name: '洛阳', x: 300, y: 262, faction: 'zheng', tier: 1 },
    { id: 'xingyang', name: '荥阳', x: 322, y: 270, faction: 'wa', tier: 0 },
    { id: 'ye', name: '邺城', x: 318, y: 205, faction: 'xia', tier: 1 },
    { id: 'jiangling', name: '江陵', x: 292, y: 350, faction: 'chu', tier: 1 },
    { id: 'lanzhou', name: '陇西', x: 215, y: 260, faction: 'qin', tier: 0 },
    { id: 'wuwei', name: '凉州', x: 180, y: 230, faction: 'liang', tier: 0 },
    { id: 'shuofang', name: '朔方', x: 232, y: 200, faction: 'liu', tier: 0 },
    { id: 'mayi', name: '马邑', x: 272, y: 190, faction: 'liu', tier: 0 },
    { id: 'yuyang', name: '渔阳', x: 352, y: 158, faction: 'yan', tier: 0 },
    { id: 'lishan', name: '历阳', x: 358, y: 302, faction: 'wu', tier: 0 },
    { id: 'kuiji', name: '会稽', x: 402, y: 372, faction: 'shen', tier: 0 },
    { id: 'yuzhang', name: '豫章', x: 344, y: 392, faction: 'lin', tier: 0 },
    { id: 'chengdu', name: '成都', x: 255, y: 355, faction: 'chu', tier: 1 },
    { id: 'jiankang', name: '建康', x: 383, y: 312, faction: 'shen', tier: 1 },
    { id: 'youzhou', name: '幽州', x: 348, y: 138, faction: 'xia', tier: 1 },
    { id: 'pengcheng', name: '彭城', x: 358, y: 278, faction: 'wa', tier: 0 },
    { id: 'qingzhou', name: '青州', x: 392, y: 248, faction: 'xia', tier: 0 },
    { id: 'guangzhou', name: '广州', x: 358, y: 452, faction: 'chu', tier: 1 }
];

export function getCity(id: string): CityDef {
    const c = CITIES.find((item) => item.id === id);
    if (!c) {
        throw new Error(`未知城池: ${id}`);
    }
    return c;
}
