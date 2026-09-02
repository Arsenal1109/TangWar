/**
 * 武将特技（数据层）：每人至多一技，名字取自演义话本，
 * 效果全部落在既有结算点上（战斗战力 / 守城城防 / 城税 / 计策 / 统率）。
 */
export type TraitId = 'junshen' | 'tiance' | 'wangzuo' | 'mouzhu' | 'tiebi';

export interface TraitDef {
    id: TraitId;
    name: string;
    desc: string;
}

export const TRAIT_DEFS: Record<TraitId, TraitDef> = {
    junshen: { id: 'junshen', name: '军神', desc: '统军出战，所部战力 +8%' },
    tiance:  { id: 'tiance',  name: '天策', desc: '天策上将，统率 +5' },
    wangzuo: { id: 'wangzuo', name: '王佐', desc: '驻守之城，商税 +20%' },
    mouzhu:  { id: 'mouzhu',  name: '谋主', desc: '运筹帷幄，计策成功率大增' },
    tiebi:   { id: 'tiebi',   name: '铁壁', desc: '据城而守，城防 +2' }
};

export function traitName(id?: TraitId): string {
    return id ? TRAIT_DEFS[id].name : '';
}
