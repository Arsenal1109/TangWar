import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';
import type { DifficultyId } from './Difficulty';

/**
 * 灾异与丰稔（引擎无关）：季节性随机事件，令每一局的天下各有气象。
 * 效果随难度伸缩：休明承天眷（灾轻福厚），虎狼历劫难（灾重福薄）——
 * 事件是变数而非胜负手，不得盖过难度分级（由三档蒙特卡洛校准）。
 */

/** 灾祸强度系数（蝗灾/时疫） */
const DISASTER_SEVERITY: Record<DifficultyId, number> = { easy: 0.6, normal: 0.9, hard: 1.5 };
/** 福佑强度系数（商旅/丰收/名马） */
const BLESSING_FACTOR: Record<DifficultyId, number> = { easy: 1.2, normal: 1.0, hard: 0.8 };

function pick<T>(list: T[], rng: () => number): T | null {
    if (list.length === 0) {
        return null;
    }
    return list[Math.floor(rng() * list.length) % list.length];
}

interface RandomEventDef {
    id: string;
    weight: number;
    run: (world: WorldState, rng: () => number) => string | null;
}

const EVENTS: RandomEventDef[] = [
    {
        id: 'locusts',
        weight: 3,
        run: (world, rng) => {
            const city = pick(world.cities, rng);
            if (!city) return null;
            const lost = Math.floor(city.food * 0.15 * DISASTER_SEVERITY[world.difficulty]);
            if (lost <= 0) return null;
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
            const sev = DISASTER_SEVERITY[world.difficulty];
            city.population = Math.floor(city.population * (1 - 0.05 * sev));
            city.morale = Math.max(0, city.morale - Math.round(5 * sev));
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
            const gain = Math.round(150 * BLESSING_FACTOR[world.difficulty]);
            city.gold += gain;
            return `商旅络绎，${city.name}市舶税入${gain}金`;
        }
    },
    {
        id: 'harvest',
        weight: 3,
        run: (world, rng) => {
            const tang = world.cities.filter((c) => c.faction === 'tang');
            const city = pick(tang, rng);
            if (!city) return null;
            const gain = Math.floor(city.food * 0.15 * BLESSING_FACTOR[world.difficulty]);
            if (gain <= 0) return null;
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
            city.gold = Math.max(0, city.gold - 120);
            city.morale = Math.max(0, city.morale - 4);
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

/** 事件发生率系数（乱世灾异更频） */
const EVENT_RATE: Record<DifficultyId, number> = { easy: 0.6, normal: 0.8, hard: 1.5 };

/**
 * 每季掷一次（首两回合不出，天下初定）。
 * 触发概率随难度伸缩：休明 4.2% / 史实 7% / 虎狼 10.5%——乱世灾异更频。
 * 效果强度刻意压低：事件是变数而非胜负手，不得盖过难度分级。
 * 返回事件文案（无事件返回 null）；文案已写入 world.log 与史册。
 */
export function rollRandomEvent(world: WorldState, rng: () => number): string | null {
    if (world.turn <= 2) {
        return null;
    }
    if (rng() >= 0.07 * EVENT_RATE[world.difficulty]) {
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
