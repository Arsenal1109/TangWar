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

export function resolveTurn(cities: CityState[], armyFoodPerThousand = 5): TurnResult {
    let totalGold = 0;
    let totalFood = 0;
    const events: CityEvent[] = [];

    for (const c of cities) {
        const foodGain = Math.floor(c.population / 10) * FOOD_PER_POP_10K;
        const goldGain = Math.floor(c.population / 10) * GOLD_PER_POP_10K;
        const foodCost = Math.floor(c.army / 1000) * armyFoodPerThousand;

        c.gold += goldGain;
        c.food += foodGain - foodCost;
        totalGold += goldGain;
        totalFood += foodGain - foodCost;

        if (c.food < 0) {
            // 缺粮：按缺口比例逃兵，并降民心
            const shortage = Math.abs(c.food);
            const deserters = Math.min(c.army, Math.floor(shortage * 50));
            c.army -= deserters;
            c.morale = Math.max(0, c.morale - 10);
            c.food = 0;
            events.push({
                cityId: c.id,
                type: 'food-shortage',
                message: `${c.name}缺粮，逃兵 ${deserters}，民心大降`
            });
        } else if (c.morale < 30) {
            c.morale = Math.max(0, c.morale - 2);
            events.push({ cityId: c.id, type: 'morale-drop', message: `${c.name}民心不稳` });
        }
    }

    return { deltas: { gold: totalGold, food: totalFood }, events };
}
