import { resolveBattle, winProbability } from './BattleSystem';
import { neighborsOf, cityDistance, getCity } from '../data/Cities';
import { getGeneralState, type GeneralState } from './GeneralSystem';
import { removeArmy, addTroops } from './Army';
import type { WorldState } from './WorldState';
import type { CityState } from './ResourceSystem';
import { TROOP_ORDER, type TroopType } from '../data/Troops';

// 军议三令的真实结算引擎：替代 UI 层剧本化战争。
// 突袭按 兵力×统率×克制×城防 真实结算（BattleSystem），可胜可败、可夺城；
// 防御/安抚为确定性经营指令；伏兵计策通过 world.flags['ambushReady'] 提供一次性突袭加成。

export type CouncilKey = 'defend' | 'raid' | 'pacify';

export interface CouncilOutcome {
    ok: boolean;
    reason: string;
    title: string;
    body: string;
    tone: 'normal' | 'good' | 'bad';
    /** 突袭实际目标城（用于 UI 路线与镜头聚焦） */
    raidTargetId?: string;
}

export const COUNCIL_COSTS: Record<CouncilKey, number> = {
    defend: 300,
    raid: 600,
    pacify: 400
};

/** 突袭伏兵加成：消耗 ambushReady 标志时攻方战力乘数（+15%）。 */
export const AMBUSH_BONUS = 0.15;

/** 夺城门槛：守军残部低于此数且城防告破则易主。 */
const CAPTURE_ARMY_THRESHOLD = 800;
const CAPTURE_DEFENSE_MAX = 2;

/** 城池守将统率：任命将领 > 势力默认 55。 */
export function commandOf(city: CityState, generals: GeneralState[]): number {
    if (city.generalId) {
        const g = generals.find((item) => item.id === city.generalId);
        if (g) {
            return g.stats.command;
        }
    }
    return 55;
}

/** 就近的相邻敌城：优先最弱目标（城防 > 守军），同弱取最近（契合"先破弱敌"的打法与井陉叙事）。 */
export function raidTarget(world: WorldState, fromId: string, ownFaction = 'tang'): CityState | null {
    const from = getCity(fromId);
    let best: CityState | null = null;
    let bestKey = '';
    for (const n of neighborsOf(fromId)) {
        const c = world.cities.find((item) => item.id === n.id);
        if (!c || c.faction === ownFaction) {
            continue;
        }
        const key = `${c.defense.toString().padStart(4, '0')}:${c.army.toString().padStart(8, '0')}:${cityDistance(from, n).toFixed(2).padStart(12, '0')}`;
        if (!best || key < bestKey) {
            bestKey = key;
            best = c;
        }
    }
    return best;
}

function emptyTroops(): Record<TroopType, number> {
    const t = {} as Record<TroopType, number>;
    for (const k of TROOP_ORDER) {
        t[k] = 0;
    }
    return t;
}

/** 从城池抽走兵力（扣除统称 army 与分兵种），并同步扣粮道损耗。 */
function takeGarrison(city: CityState, troops: Record<TroopType, number>): void {
    for (const t of TROOP_ORDER) {
        city.troops[t] = Math.max(0, city.troops[t] - (troops[t] ?? 0));
    }
    city.army = TROOP_ORDER.reduce((s, t) => s + city.troops[t], 0);
}

/** 突袭实时胜算（0..100，供 UI 军议卡显示；伏兵就绪时无视城防）。 */
export function raidOdds(world: WorldState, fromId: string, ownFaction = 'tang'): number {
    const city = world.cities.find((c) => c.id === fromId);
    const target = raidTarget(world, fromId, ownFaction);
    if (!city || !target) {
        return 0;
    }
    const ambush = world.flags['ambushReady'] === true;
    const p = winProbability(
        { generalCommand: commandOf(city, world.generals), troops: { ...city.troops } },
        { generalCommand: commandOf(target, world.generals), troops: { ...target.troops } },
        { cityDefense: ambush ? 0 : target.defense }
    );
    return Math.round(p * 100);
}

export function executeCouncilOrder(
    world: WorldState,
    key: CouncilKey,
    cityId: string,
    rng: () => number = Math.random
): CouncilOutcome {
    const city = world.cities.find((c) => c.id === cityId);
    if (!city) {
        return { ok: false, reason: `未知城池: ${cityId}`, title: '', body: '', tone: 'bad' };
    }
    const cost = COUNCIL_COSTS[key];
    if (city.food < cost) {
        return { ok: false, reason: '粮草不足，军令无法下达', title: '', body: '', tone: 'bad' };
    }
    city.food -= cost;

    if (key === 'defend') {
        city.defense += 8;
        city.morale = Math.min(100, city.morale + 3);
        return {
            ok: true,
            reason: '',
            title: `${city.name}防线加固`,
            body: `城防提升至 ${city.defense}，军心稳固，敌军暂缓推进。`,
            tone: 'good'
        };
    }

    if (key === 'pacify') {
        city.morale = Math.min(100, city.morale + 8);
        addTroops(city, 'fubing', 600);
        return {
            ok: true,
            reason: '',
            title: `${city.name}乡勇归附`,
            body: '新得府兵六百，民心提升，后方粮道恢复。',
            tone: 'good'
        };
    }

    // —— 突袭：就近相邻敌城，真实结算 ——
    const target = raidTarget(world, cityId, city.faction);
    if (!target) {
        city.food += cost; // 无目标退回粮草
        return { ok: false, reason: '境内无敌军可袭，先调兵或转攻他城', title: '', body: '', tone: 'bad' };
    }
    if (city.army <= 0) {
        city.food += cost;
        return { ok: false, reason: `${city.name}无兵可用，先募兵再战`, title: '', body: '', tone: 'bad' };
    }

    const ambush = world.flags['ambushReady'] === true;
    const attCommand = commandOf(city, world.generals);
    const defCommand = commandOf(target, world.generals);
    const attacker = { generalCommand: attCommand, troops: { ...city.troops } };
    const defender = { generalCommand: defCommand, troops: { ...target.troops } };
    const result = resolveBattle(attacker, defender, {
        cityDefense: ambush ? 0 : target.defense,
        rng
    });
    if (ambush) {
        world.flags['ambushReady'] = false; // 伏兵只策应一次突袭
    }

    removeArmy(city, result.attackerLoss);
    removeArmy(target, result.defenderLoss);
    let captured = false;
    let extra = '';
    if (result.attackerWin && (target.army <= CAPTURE_ARMY_THRESHOLD || target.defense <= CAPTURE_DEFENSE_MAX)) {
        // 破城：缴获三成府库，城池易主但残破
        const loot = Math.floor(target.gold * 0.3);
        target.faction = city.faction;
        target.gold -= loot;
        target.morale = 50;
        target.defense = 3;
        target.generalId = null;
        captured = true;
        extra = `缴获黄金 ${loot}，${target.name}已入版图。`;
    } else if (result.attackerWin) {
        target.defense = Math.max(0, target.defense - 3);
        target.morale = Math.max(0, target.morale - 10);
        extra = `${target.name}城防受损，守军士气受挫。`;
    } else {
        city.morale = Math.max(0, city.morale - 6);
        extra = '攻势受挫，我军军心微降。';
    }

    const title = result.attackerWin ? (captured ? `奇袭${target.name}得胜` : `${target.name}城下破敌`) : `${target.name}攻势受挫`;
    const body = `${result.report}。${extra}`;
    return {
        ok: true,
        reason: '',
        title,
        body,
        tone: result.attackerWin ? 'good' : 'bad',
        raidTargetId: target.id
    };
}

export { emptyTroops, takeGarrison };
