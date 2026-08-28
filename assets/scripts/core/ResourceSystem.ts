export interface CityFacilities {
    farm: number;     // 农田 0..3
    market: number;   // 商市 0..3
    barracks: number; // 兵营 0..3
    granary: number;  // 仓廪 0..3
}

export interface CityState {
    id: string;
    name: string;
    faction: string;
    population: number;  // 万
    food: number;
    gold: number;
    army: number;
    defense: number;
    morale: number;
    generalId: string | null;
    facilities: CityFacilities;
    policyUsed: boolean;
}

export interface TurnDelta {
    gold: number;
    food: number;
}

export interface CityEvent {
    cityId: string;
    type: 'food-shortage' | 'desertion' | 'morale-drop';
    message: string;
}

export interface TurnResult {
    deltas: TurnDelta;
    events: CityEvent[];
}

const FOOD_PER_POP_10K = 100;    // 每 1 万人口，每季产粮 100
const GOLD_PER_POP_10K = 40;     // 每 1 万人口，每季产金 40
const FOOD_PER_1000_ARMY = 5;    // 每千兵每季耗粮 5
const FACILITY_FOOD_BONUS = 0.2; // 农田每级 +20% 粮
const FACILITY_GOLD_BONUS = 0.2; // 商市每级 +20% 金
const GRANARY_PER_LEVEL = 300;   // 仓廪每级缓冲缺粮 300

export function resolveTurn(cities: CityState[], armyFoodPerThousand = 5): TurnResult {
    let totalGold = 0;
    let totalFood = 0;
    const events: CityEvent[] = [];

    for (const c of cities) {
        const foodGain = Math.floor(c.population / 10) * FOOD_PER_POP_10K * (1 + FACILITY_FOOD_BONUS * c.facilities.farm);
        const goldGain = Math.floor(c.population / 10) * GOLD_PER_POP_10K * (1 + FACILITY_GOLD_BONUS * c.facilities.market);
        const foodCost = Math.floor(c.army / 1000) * armyFoodPerThousand;

        c.gold += goldGain;
        c.food += foodGain - foodCost;
        totalGold += goldGain;
        totalFood += foodGain - foodCost;

        if (c.food < 0) {
            // 缺粮：先由仓廪缓冲，再按缺口比例逃兵并降民心
            const shortage = -c.food;
            const absorbed = Math.min(c.facilities.granary * GRANARY_PER_LEVEL, shortage);
            c.food += absorbed;
            const remain = -c.food;
            if (remain > 0) {
                const deserters = Math.min(c.army, Math.floor(remain * 50));
                c.army -= deserters;
                c.morale = Math.max(0, c.morale - 10);
                c.food = 0;
                events.push({
                    cityId: c.id,
                    type: 'food-shortage',
                    message: `${c.name}缺粮，逃兵 ${deserters}，民心大降`
                });
            }
        } else if (c.morale < 30) {
            c.morale = Math.max(0, c.morale - 2);
            events.push({ cityId: c.id, type: 'morale-drop', message: `${c.name}民心不稳` });
        }
    }

    return { deltas: { gold: totalGold, food: totalFood }, events };
}
