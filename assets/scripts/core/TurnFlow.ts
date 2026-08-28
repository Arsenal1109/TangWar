import type { WorldState } from './WorldState';
import { resolveTurn } from './ResourceSystem';
import { decideFactions, applyAiActions } from './AI';
import { checkHistoricalEvents } from './EventSystem';
import { checkVictory, type VictoryResult } from './Victory';

export interface TurnOutcome {
    log: string[];
    eventNames: string[];
    victory: VictoryResult | null;
}

// 单回合装配：AI → 资源结算 → 历史事件 → 胜负判定，收集战报后清空 log
export function runWorldTurn(world: WorldState, rng?: () => number): TurnOutcome {
    const actions = decideFactions(world, rng);
    applyAiActions(world, actions);

    const res = resolveTurn(world.cities);
    for (const e of res.events) {
        world.log.push(e.message);
    }

    const ev = checkHistoricalEvents(world);

    const victory = checkVictory(world);

    const out: TurnOutcome = {
        log: [...world.log],
        eventNames: ev.names,
        victory: victory.finished ? victory : null
    };
    world.log = [];
    return out;
}