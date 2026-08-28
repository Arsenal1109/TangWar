export type TroopType = 'fubing' | 'jingbing' | 'qibing' | 'nubing' | 'xuanjia' | 'shuijun';

export interface TroopDef {
    id: TroopType;
    name: string;
    cost: number;           // 招募每千人耗金
    foodPerThousand: number;// 每千兵每季耗粮
    atk: number;            // 攻击
    def: number;            // 防御
    speed: number;          // 行军速度系数
}

export const TROOP_ORDER: TroopType[] = ['fubing', 'jingbing', 'qibing', 'nubing', 'xuanjia', 'shuijun'];

export const TROOPS: Record<TroopType, TroopDef> = {
    fubing:  { id: 'fubing',  name: '府兵',  cost: 100, foodPerThousand: 5,  atk: 10, def: 10, speed: 1.0 },
    jingbing:{ id: 'jingbing',name: '精兵',  cost: 200, foodPerThousand: 7,  atk: 15, def: 12, speed: 1.0 },
    qibing:  { id: 'qibing',  name: '骑兵',  cost: 250, foodPerThousand: 10, atk: 14, def: 9,  speed: 2.0 },
    nubing:  { id: 'nubing',  name: '弩兵',  cost: 180, foodPerThousand: 6,  atk: 13, def: 7,  speed: 0.9 },
    xuanjia: { id: 'xuanjia', name: '玄甲军',cost: 800, foodPerThousand: 15, atk: 22, def: 18, speed: 1.8 },
    shuijun: { id: 'shuijun', name: '水军',  cost: 200, foodPerThousand: 8,  atk: 11, def: 10, speed: 1.0 }
};

// 克制矩阵：key 克制 value 中的兵种（攻击 +30%）
export const COUNTER: Record<TroopType, TroopType[]> = {
    fubing:  [],
    jingbing:['fubing'],
    qibing:  ['nubing', 'fubing'],
    nubing:  ['jingbing', 'fubing', 'xuanjia'],
    xuanjia: ['qibing', 'jingbing', 'fubing'],
    shuijun: []
};

export function troopName(t: TroopType): string {
    return TROOPS[t].name;
}

export function isCounter(att: TroopType, def: TroopType): boolean {
    return COUNTER[att].includes(def);
}
