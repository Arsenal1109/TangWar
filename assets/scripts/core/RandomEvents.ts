import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';

/**
 * 灾异与丰稔（引擎无关）：季节性随机事件，令每一局的天下各有气象。
 * 效果全部温和（±25% 单城资源 / ±8 民心 / 少量金粮），只添变数不掀桌。
 */

interface RandomEventDef {
    id: string;
    weight: number;
    run: (world: WorldState, rng: () => number) => string | null;
}

function pick<T>(list: T[], rng: () => number): T | null {
    if (list.length === 0) {
        return null;
    }
    return list[Math.floor(rng() * list.length) % list.length];
}

const EVENTS: RandomEventDef[] = [
    {
        id: 'locusts',
        weight: 3,
        run: (world, rng) => {
            const city = pick(world.cities, rng);
            if (!city) return null;
            const lost = Math.floor(city.food * 0.25);
            city.food -= lost;
            return `蝗灾过境，${city.name}粮草折损${lost}石`;
        }
    },
    {
        id: 'plague',
        weight: 2,
        run: (world, rng) => {
            const city = pick(world.cities, rng);
            if (!city) return null;
            city.population = Math.floor(city.population * 0.92);
            city.morale = Math.max(0, city.morale - 8);
            return `时疫流行，${city.name}人口凋敝、民心动荡`;
        }
    },
    {
        id: 'trade',
        weight: 2,
        run: (world, rng) => {
            const tang = world.cities.filter((c) => c.faction === 'tang');
            const city = pick(tang, rng);
            if (!city) return null;
            city.gold += 180;
            return `商旅络绎，${city.name}市舶税入${180}金`;
        }
    },
    {
        id: 'harvest',
        weight: 3,
        run: (world, rng) => {
            const tang = world.cities.filter((c) => c.faction === 'tang');
            const city = pick(tang, rng);
            if (!city) return null;
            const gain = Math.floor(city.food * 0.2);
            city.food += gain;
            return `岁穗丰稔，${city.name}粮食增收${gain}石`;
        }
    },
    {
        id: 'bandits',
        weight: 2,
        run: (world, rng) => {
            const enemies = world.cities.filter((c) => c.faction !== 'tang' && c.faction !== 'none');
            const city = pick(enemies, rng);
            if (!city) return null;
            city.gold = Math.max(0, city.gold - 150);
            city.morale = Math.max(0, city.morale - 5);
            return `盗匪横行，${city.name}府库遭掠、人心不安`;
        }
    },
    {
        id: 'horses',
        weight: 1,
        run: (world, rng) => {
            const tang = world.cities.filter((c) => c.faction === 'tang');
            const border = tang.filter((c) => c.army > 0);
            const city = pick(border, rng);
            if (!city) return null;
            city.troops.qibing += 200;
            city.army += 200;
            return `西域名马入贡，${city.name}得骁骑二百`;
        }
    }
];

const TOTAL_WEIGHT = EVENTS.reduce((s, e) => s + e.weight, 0);

/**
 * 每季掷一次（首两回合不出，天下初定）。触发概率 12%。
 * 返回事件文案（无事件返回 null）；文案已写入 world.log 与史册。
 */
export function rollRandomEvent(world: WorldState, rng: () => number): string | null {
    if (world.turn <= 2) {
        return null;
    }
    if (rng() >= 0.12) {
        return null;
    }
    let roll = rng() * TOTAL_WEIGHT;
    for (const ev of EVENTS) {
        roll -= ev.weight;
        if (roll > 0) {
            continue;
        }
        const message = ev.run(world, rng);
        if (message) {
            world.log.push(message);
            recordChronicle(world, message);
            return message;
        }
        return null;
    }
    return null;
}
