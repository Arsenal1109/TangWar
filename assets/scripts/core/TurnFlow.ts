import type { WorldState } from './WorldState';
import { resolveTurn } from './ResourceSystem';
import { decideFactions, applyAiActions } from './AI';
import { checkHistoricalEvents } from './EventSystem';
import { checkVictory, type VictoryResult } from './Victory';
import { tickWorldMarches } from './MarchSystem';

export interface TurnOutcome {
    log: string[];
    eventNames: string[];
    victory: VictoryResult | null;
    /** 领土急报：本回合 AI 攻占的唐城（UI 以急报级呈现） */
    alerts: string[];
}

// 单回合装配：行军到达 → AI → 资源结算 → 历史事件 → 胜负判定，收集战报后清空 log
export function runWorldTurn(world: WorldState, rng?: () => number): TurnOutcome {
    tickWorldMarches(world, rng);

    const actions = decideFactions(world, rng);
    // 记录 AI 进攻唐土的意图，结算后核对是否得手 → 领土急报
    const tangTargets = new Set(
        actions.filter((a) => a.kind === 'expand' && a.targetCityId)
            .map((a) => a.targetCityId!)
            .filter((id) => world.cities.some((c) => c.id === id && c.faction === 'tang'))
    );
    applyAiActions(world, actions);
    const alerts: string[] = [];
    for (const id of tangTargets) {
        const city = world.cities.find((c) => c.id === id);
        if (city && city.faction !== 'tang') {
            alerts.push(`急报：${city.name}失守，已被${city.faction === 'tang' ? '' : ''}敌军攻占！`);
            world.log.push(alerts[alerts.length - 1]);
        }
    }

    const res = resolveTurn(world.cities);
    for (const e of res.events) {
        world.log.push(e.message);
    }

    const ev = checkHistoricalEvents(world);

    const victory = checkVictory(world);

    const out: TurnOutcome = {
        log: [...world.log],
        eventNames: ev.names,
        victory: victory.finished ? victory : null,
        alerts
    };
    world.log = [];
    return out;
}