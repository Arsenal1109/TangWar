/**
 * 城池特产（数据层）：逐城赋予一种物产/地利，带来常驻的小幅加成。
 * 效果全部落在既有结算点上（季税/季粮/募兵价/城防），不引入新状态。
 */
export type SpecialtyId = 'horses' | 'trade' | 'fertile' | 'pass' | 'iron';

export interface SpecialtyDef {
    id: SpecialtyId;
    name: string;
    desc: string;
}

export const SPECIALTIES: Record<SpecialtyId, SpecialtyDef> = {
    horses:  { id: 'horses',  name: '马政', desc: '此地牧马，募骑兵/精兵金费 -20%' },
    trade:   { id: 'trade',   name: '商埠', desc: '舟车辐辏，每季商税 +15%' },
    fertile: { id: 'fertile', name: '膏腴', desc: '天府之国，每季粮产 +15%' },
    pass:    { id: 'pass',    name: '雄关', desc: '山河为险，守城城防 +2' },
    iron:    { id: 'iron',    name: '盐铁', desc: '煮海铸山，每季金粮 +10%' }
};

/** 逐城特产（未列出者无特产）。 */
export const CITY_SPECIALTIES: Record<string, SpecialtyId> = {
    wuwei: 'horses',      // 凉州牧马
    shuofang: 'horses',   // 朔方马场
    lanzhou: 'horses',    // 陇右牧监
    mayi: 'horses',       // 马邑——因马得名
    jiangdu: 'trade',     // 江都运河枢纽
    jiangling: 'trade',   // 江陵荆襄商埠
    jiankang: 'trade',    // 建康三吴都会
    guangzhou: 'trade',   // 广州海舶市舶
    chengdu: 'fertile',   // 天府之国
    youzhou: 'fertile',   // 幽燕沃野
    taiyuan: 'pass',      // 北都雄镇
    luoyang: 'pass',      // 虎牢/轘辕之险
    changan: 'iron',      // 关中盐铁池苑
    yuzhang: 'iron'       // 豫章铜山
};

export function specialtyOf(cityId: string): SpecialtyId | null {
    return CITY_SPECIALTIES[cityId] ?? null;
}

export function specialtyName(cityId: string): string {
    const id = specialtyOf(cityId);
    return id ? SPECIALTIES[id].name : '—';
}
