import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';
import { resolveTurn } from './ResourceSystem';
import { decideFactions, applyAiActions } from './AI';
import { checkHistoricalEvents } from './EventSystem';
import { checkVictory, type VictoryResult } from './Victory';
import { tickWorldMarches } from './MarchSystem';
import { tickPacts, updateAiDiplomacy, applyAiSchemes, type EnvoyOffer } from './AIDiplomacy';
import { rollRandomEvent } from './RandomEvents';
import { resolveLoyaltyTurnover, announceTalents } from './TalentSystem';
import { checkAchievements } from './Achievements';
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
    /** 本回合新解锁的功业（成就）id */
    achievements: string[];
}

/** 盟邦岁贡：每年正月，每个盟邦向唐输财 120 金（入最富唐城）并深化邦交。 */
export function collectAllyTribute(world: WorldState): string[] {
    const lines: string[] = [];
    for (const allyId of world.diplomacy.allies) {
        // 盟邦须仍立于世
        if (!world.cities.some((c) => c.faction === allyId)) {
            continue;
        }
        const tang = world.cities.filter((c) => c.faction === 'tang').sort((a, b) => b.gold - a.gold)[0];
        if (!tang) {
            continue;
        }
        // 联姻之盟：岁贡翻倍（240）
        const married = world.diplomacy.marriedAllies?.includes(allyId) ?? false;
        const amount = married ? 240 : 120;
        tang.gold += amount;
        world.diplomacy.relations[allyId] = Math.max(-100, Math.min(100, (world.diplomacy.relations[allyId] ?? 0) + 2));
        lines.push(`${getFaction(allyId).name}遣使岁贡，输金 ${amount} 入${tang.name}府库`);
    }
    return lines;
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

    const res = resolveTurn(world.cities, 5, world.generals);
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

    // 灾异丰稔：天下各有气象（12%/季，首两回合不出）
    rollRandomEvent(world, rand);

    // 岁首（正月）：盟邦岁贡 + 求贤令
    if (world.seasonIndex === 0 && world.turn > 0) {
        const tribute = collectAllyTribute(world);
        for (const t of tribute) {
            world.log.push(t);
        }
        announceTalents(world);
    }

    // 岁末（冬末）：忠诚结算——敌将离心可弃暗投明，唐将怀怨亦会叛逃
    if (world.seasonIndex === 3) {
        resolveLoyaltyTurnover(world, rand);
    }

    // 虎狼暗计（离间/谣言）→ 群雄外交推演：合纵结盟写日志，遣使要约交玩家抉择
    const schemes = applyAiSchemes(world, rand);
    const envoy = updateAiDiplomacy(world, rand);
    // 历史事件与合纵盟约入史册（去重：eventSystem 自己的 log 不重复记）
    for (const name of ev.names) {
        recordChronicle(world, `史事 · ${name}`);
    }
    for (const line of world.log) {
        if (line.includes('歃血为盟') || line.includes('弃暗投明') || line.includes('仗策归唐')) {
            recordChronicle(world, line);
        }
    }

    // 绝地标记：唐土一度仅剩两城以下
    if (world.cities.filter((c) => c.faction === 'tang').length <= 2) {
        world.flags['lowPoint'] = true;
    }

    const victory = checkVictory(world);
    // 功业（成就）结算：从世界状态推导新解锁项
    const achievements = checkAchievements(world);

    const out: TurnOutcome = {
        log: [...world.log, ...schemes],
        eventNames: ev.names,
        victory: victory.finished ? victory : null,
        alerts,
        envoy,
        achievements
    };
    world.log = [];
    return out;
}