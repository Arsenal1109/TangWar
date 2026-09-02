import type { WorldState } from './WorldState';

/**
 * 功业（成就）：跨局不保留、本局内解锁；条件全部从世界状态推导。
 * checkAchievements 每回合末与关键动作（延请/外交）后调用，返回新解锁项。
 */

export interface AchievementDef {
    id: string;
    name: string;
    desc: string;
    check: (world: WorldState) => boolean;
}

function flagNum(world: WorldState, key: string): number {
    return Number(world.flags[key]) || 0;
}

function tangGenerals(world: WorldState) {
    return world.generals.filter((g) => g.faction === 'tang');
}

function tangCities(world: WorldState) {
    return world.cities.filter((c) => c.faction === 'tang');
}

export const ACHIEVEMENTS: AchievementDef[] = [
    {
        id: 'first-victory',
        name: '首战告捷',
        desc: '取得第一场突袭胜利',
        check: (w) => flagNum(w, 'battleWins') >= 1
    },
    {
        id: 'city-taker',
        name: '攻城略地',
        desc: '攻克 3 座城池',
        check: (w) => flagNum(w, 'captures') >= 3
    },
    {
        id: 'five-tigers',
        name: '五虎俱全',
        desc: '唐营拥有 5 位勇武 ≥ 90 的虎将',
        check: (w) => tangGenerals(w).filter((g) => g.stats.valor >= 90).length >= 5
    },
    {
        id: 'seek-talent',
        name: '千金买骨',
        desc: '首次延请在野贤才',
        check: (w) => flagNum(w, 'recruits') >= 1
    },
    {
        id: 'talent-magnet',
        name: '求贤若渴',
        desc: '延请 3 位在野贤才',
        check: (w) => flagNum(w, 'recruits') >= 3
    },
    {
        id: 'full-treasury',
        name: '府库充盈',
        desc: '唐土累积黄金达 5000',
        check: (w) => tangCities(w).reduce((s, c) => s + c.gold, 0) >= 5000
    },
    {
        id: 'people-first',
        name: '民心所向',
        desc: '唐土平均民心达 85',
        check: (w) => {
            const cities = tangCities(w);
            return cities.length > 0 && cities.reduce((s, c) => s + c.morale, 0) / cities.length >= 85;
        }
    },
    {
        id: 'first-ally',
        name: '合纵连横',
        desc: '首次与他势力结盟',
        check: (w) => w.diplomacy.allies.length >= 1
    },
    {
        id: 'hulao',
        name: '虎牢大捷',
        desc: '亲历虎牢关之战的鼎盛一刻',
        check: (w) => w.flags['hulaoguan-victory'] === true
    },
    {
        id: 'borrow-troops',
        name: '借兵勤王',
        desc: '首次向盟邦借得援军',
        check: (w) => flagNum(w, 'borrows') >= 1
    }
];

/** 检查并解锁：写入 world.achievements，返回本次新解锁的成就 id 列表。 */
export function checkAchievements(world: WorldState): string[] {
    const unlocked: string[] = [];
    for (const a of ACHIEVEMENTS) {
        if (world.achievements.includes(a.id)) {
            continue;
        }
        if (a.check(world)) {
            world.achievements.push(a.id);
            unlocked.push(a.id);
        }
    }
    return unlocked;
}

export function achievementById(id: string): AchievementDef | undefined {
    return ACHIEVEMENTS.find((a) => a.id === id);
}
