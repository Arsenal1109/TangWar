/**
 * 难度分级（易/标准/困难）：
 * - 影响群雄进取概率（aiAggression 乘数）与群雄城池每季补贴（aiStipend）；
 * - 新局时调整唐室初始粮金（playerStart 系数）。
 * 难度随世界态持久化（存档 v2 optional 字段），旧档缺省为标准。
 */
export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
    id: DifficultyId;
    name: string;
    desc: string;
    /** 群雄进取概率乘数：0.6=休明 / 1.0=史实 / 1.6=虎狼 */
    aiAggression: number;
    /** 每季给每个群雄城池的粮金补贴（虎狼 AI 经济滚雪球） */
    aiStipend: number;
    /** 唐室初始资源系数 */
    playerStart: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
    easy: {
        id: 'easy',
        name: '休明',
        desc: '群雄内争不休，唐室府库充盈——适合熟悉玩法',
        aiAggression: 0.5,
        aiStipend: 0,
        playerStart: 1.5
    },
    normal: {
        id: 'normal',
        name: '史实',
        desc: '群雄逐鹿如史书所载，唐室以太原一镇起兵',
        aiAggression: 1.0,
        aiStipend: 30,
        playerStart: 1.0
    },
    hard: {
        id: 'hard',
        name: '虎狼',
        desc: '群雄四面张网，粮金滚滚——名将亦需步步为营',
        aiAggression: 1.6,
        aiStipend: 70,
        playerStart: 0.75
    }
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];

/** 宽容解析：未知/缺省一律回落到标准难度。 */
export function difficultyOf(id: string | null | undefined): DifficultyDef {
    if (id === 'easy' || id === 'normal' || id === 'hard') {
        return DIFFICULTIES[id];
    }
    return DIFFICULTIES.normal;
}

/** 新局一次性生效：按难度调整唐室城池的初始粮金（仅 faction=tang）。 */
export function applyDifficultyStart(world: { cities: Array<{ faction: string; food: number; gold: number }> }, id: string): void {
    const def = difficultyOf(id);
    if (def.playerStart === 1) {
        return;
    }
    for (const c of world.cities) {
        if (c.faction === 'tang') {
            c.food = Math.round(c.food * def.playerStart);
            c.gold = Math.round(c.gold * def.playerStart);
        }
    }
}
