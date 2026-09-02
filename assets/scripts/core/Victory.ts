import type { WorldState } from './WorldState';
import { countCities } from './WorldState';
import { CITIES } from '../data/Cities';

export type EndingGrade = 'unify' | 'reign' | 'decline' | 'defeat';

export interface VictoryResult {
    finished: boolean;
    grade: EndingGrade;
    message: string;
}

export function checkVictory(world: WorldState): VictoryResult {
    const tang = countCities(world, 'tang');
    if (tang === 0) {
        return { finished: true, grade: 'defeat', message: '李唐灭国，天下易主' };
    }
    if (tang >= CITIES.length) {
        return { finished: true, grade: 'unify', message: '四海归一，李唐一统天下！' };
    }
    if (world.year >= 626) {
        // 武德九年：守不住三城即为偏安残局；保有基业且曾入主长安则迎来贞观之治
        if (tang <= 2 || !world.flags['chengdi']) {
            return { finished: true, grade: 'decline', message: '武德九年，唐室式微，偏安一隅' };
        }
        return { finished: true, grade: 'reign', message: '武德九年，玄武门变，李世民即位，贞观之治' };
    }
    return { finished: false, grade: 'decline', message: '' };
}