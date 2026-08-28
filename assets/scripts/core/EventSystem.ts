import { HISTORICAL_EVENTS } from '../data/HistoricalEvents';
import type { WorldState } from './WorldState';

export interface HistoricalEventResult {
    names: string[];
    messages: string[];
}

export function checkHistoricalEvents(world: WorldState): HistoricalEventResult {
    const names: string[] = [];
    const messages: string[] = [];
    for (const ev of HISTORICAL_EVENTS) {
        if (world.flags[ev.id]) {
            continue; // 只触发一次
        }
        if (ev.condition(world)) {
            ev.run(world);
            world.flags[ev.id] = true;
            names.push(ev.name);
            const msg = `${ev.name}：${ev.message}`;
            messages.push(msg);
            world.log.push(msg);
        }
    }
    return { names, messages };
}