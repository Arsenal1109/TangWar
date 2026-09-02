import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';
import { resolveTurn } from './ResourceSystem';
import { decideFactions, applyAiActions } from './AI';
import { checkHistoricalEvents } from './EventSystem';
import { checkVictory, type VictoryResult } from './Victory';
import { tickWorldMarches } from './MarchSystem';
import { tickPacts, updateAiDiplomacy, applyAiSchemes, type EnvoyOffer } from './AIDiplomacy';
import { getFaction } from '../data/Factions';
import { difficultyOf } from './Difficulty';

export interface TurnOutcome {
    log: string[];
    eventNames: string[];
    victory: VictoryResult | null;
    /** 领土急报：本回合 AI 攻占的唐城（UI 以急报级呈现） */
    alerts: string[];
    /** 群雄遣使要约（求和/勒索），需玩家抉择；无则 null */
    envoy: EnvoyOffer | null;
}

// 单回合装配：停战计时 → 行军到达 → AI → 资源结算 → 历史事件 → 外交推演 → 胜负判定
export function runWorldTurn(world: WorldState, rng?: () => number): TurnOutcome {
    const rand = rng ?? Math.random;
    tickPacts(world);
    tickWorldMarches(world, rng);

    const actions = decideFactions(world, rng);
    // 记录 AI 进攻唐土的意图，结算后核对是否得手 → 领土急报
    const tangTargets = new Set(
        actions.filter((a) => a.kind === 'expand' && a.targetCityId)
            .map((a) => a.targetCityId!)
            .filter((id) => world.cities.some((c) => c.id === id && c.faction === 'tang'))
    );
    applyAiActions(world, actions, rng);
    const alerts: string[] = [];
    for (const id of tangTargets) {
        const city = world.cities.find((c) => c.id === id);
        if (city && city.faction !== 'tang') {
            const captor = getFaction(city.faction).name;
            const msg = `急报：${city.name}失守，已被${captor}攻占！`;
            alerts.push(msg);
            world.log.push(msg);
            recordChronicle(world, `${city.name}失守，陷于${captor}`);
        }
    }

    const res = resolveTurn(world.cities);
    for (const e of res.events) {
        world.log.push(e.message);
    }
    // 难度补贴：给群雄城池每季发放粮金（休明 0 / 史实 30 / 虎狼 70），滚出 AI 经济雪球
    const stipend = difficultyOf(world.difficulty).aiStipend;
    if (stipend > 0) {
        for (const c of world.cities) {
            if (c.faction !== 'tang') {
                c.gold += stipend;
                c.food += stipend;
            }
        }
    }

    const ev = checkHistoricalEvents(world);

    // 虎狼暗计（离间/谣言）→ 群雄外交推演：合纵结盟写日志，遣使要约交玩家抉择
    const schemes = applyAiSchemes(world, rand);
    const envoy = updateAiDiplomacy(world, rand);
    // 历史事件与合纵盟约入史册（去重：eventSystem 自己的 log 不重复记）
    for (const name of ev.names) {
        recordChronicle(world, `史事 · ${name}`);
    }
    for (const line of world.log) {
        if (line.includes('歃血为盟')) {
            recordChronicle(world, line);
        }
    }

    const victory = checkVictory(world);

    const out: TurnOutcome = {
        log: [...world.log, ...schemes],
        eventNames: ev.names,
        victory: victory.finished ? victory : null,
        alerts,
        envoy
    };
    world.log = [];
    return out;
}