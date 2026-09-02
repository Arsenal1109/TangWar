import { TRAIT_DEFS, type TraitId } from '../data/Traits';
import type { CityState } from './ResourceSystem';
import type { GeneralState } from './GeneralSystem';
import type { WorldState } from './WorldState';

/**
 * 特技结算点（引擎无关）：
 * - 军神：BattleSystem 战力 +8%（BattleArmy.trait）
 * - 天策：commandOf 统率 +5
 * - 铁壁：守城城防 +2（attackSide/defenseSide 组装处）
 * - 王佐：resolveTurn 驻城商税 +20%
 * - 谋主：计策成功率（advisorStrategy 提供 +25 谋略加成）
 */

/** 军神战力加成（乘算） */
export const JUNSHEN_POWER = 0.08;
/** 天策统率加成（加算） */
export const TIANCE_COMMAND = 5;
/** 铁壁城防加成（加算） */
export const TIEBI_DEFENSE = 2;
/** 王佐商税加成（乘算） */
export const WANGZUO_GOLD = 0.2;
/** 谋主谋略加成（计入 selfStrategy） */
export const MOUZHU_STRATEGY = 25;

/** 城池守将的特技（无守将或特技缺失返回 null）。 */
export function traitOf(city: CityState, generals: GeneralState[]): TraitId | null {
    if (!city.generalId) {
        return null;
    }
    return generals.find((item) => item.id === city.generalId)?.trait ?? null;
}

/** 玩家谋主当前谋略值：优先取谋略最高的唐营谋主（魏征归唐后即接掌），无谋主则退回刘文静，再退 80。 */
export function advisorStrategy(world: WorldState): number {
    const tang = world.generals.filter((g) => g.faction === 'tang');
    const strategists = tang
        .filter((g) => g.trait === 'mouzhu')
        .sort((a, b) => b.stats.strategy - a.stats.strategy);
    if (strategists.length > 0) {
        return strategists[0].stats.strategy;
    }
    const fallback = tang.find((g) => g.id === 'liuwenjing');
    return fallback ? fallback.stats.strategy : 80;
}

export { TRAIT_DEFS };
