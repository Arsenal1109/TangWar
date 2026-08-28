export interface PolicyEffects {
    food: number;       // 立即粮草变动
    gold: number;       // 立即黄金变动
    population: number; // 人口变动（万）
    morale: number;     // 民心变动
    defense: number;    // 城防变动
    army: number;       // 兵力变动
}

export interface PolicyDef {
    id: string;
    name: string;
    desc: string;
    costGold: number;
    costFood: number;
    effects: PolicyEffects;
}

export const POLICIES: PolicyDef[] = [
    { id: 'farming', name: '劝课农桑', desc: '耗金 300 · 粮 +400 · 民心 +2', costGold: 300, costFood: 0, effects: { food: 400, gold: 0, population: 0, morale: 2, defense: 0, army: 0 } },
    { id: 'relief', name: '开仓济民', desc: '耗粮 800 · 民心 +8', costGold: 0, costFood: 800, effects: { food: 0, gold: 0, population: 0, morale: 8, defense: 0, army: 0 } },
    { id: 'migrate', name: '招募流民', desc: '耗金 500 · 人口 +1.2万', costGold: 500, costFood: 0, effects: { food: 0, gold: 0, population: 1.2, morale: 1, defense: 0, army: 0 } },
    { id: 'walls', name: '修城筑防', desc: '耗金 600 · 城防 +5', costGold: 600, costFood: 0, effects: { food: 0, gold: 0, population: 0, morale: 0, defense: 5, army: 0 } },
    { id: 'drill', name: '整顿军备', desc: '耗金 700 · 兵 +800 · 民心 -2', costGold: 700, costFood: 0, effects: { food: 0, gold: 0, population: 0, morale: -2, defense: 0, army: 800 } },
    { id: 'levy', name: '加征赋税', desc: '金 +500 · 民心 -6', costGold: 0, costFood: 0, effects: { food: 0, gold: 500, population: 0, morale: -6, defense: 0, army: 0 } }
];

export function getPolicy(id: string): PolicyDef {
    const p = POLICIES.find((item) => item.id === id);
    if (!p) {
        throw new Error(`未知施策: ${id}`);
    }
    return p;
}
