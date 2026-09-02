import type { WorldState } from './WorldState';
import { ACHIEVEMENTS } from './Achievements';
import { GENERALS } from '../data/Generals';

/**
 * 结局铭文：按结局等次、年号、功业与疆土生成史册收束之笔。
 * 供结局结算画面与存档摘要共用（引擎无关，可测）。
 */

export interface Epilogue {
    /** 铭文段落（2–4 段） */
    paragraphs: string[];
    /** 一句总评（印章下方） */
    verdict: string;
}

export function buildEpilogue(world: WorldState, grade: string): Epilogue {
    const era = world.eraName ? `${world.eraName}` : null;
    const cities = world.cities.filter((c) => c.faction === 'tang').length;
    const generals = world.generals.filter((g) => g.faction === 'tang').length;
    const achCount = world.achievements.length;
    const achNames = world.achievements
        .map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name)
        .filter((n): n is string => !!n);
    const population = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.population, 0);

    const paragraphs: string[] = [];
    let verdict = '';

    if (grade === 'unify' || grade === 'reign') {
        paragraphs.push(
            era
                ? `${era}年间，太宗算无遗策，将士用命，自晋阳举义以来，扫平群雄，混一宇内。`
                : '晋阳举义，旗鼓向阙。李唐扫平群雄，混一宇内，天下重归一统。'
        );
        paragraphs.push(`唐土${cities}城，户口${population.toFixed(0)}万，麾下良将${generals}员。`);
        if (achCount > 0) {
            paragraphs.push(`功业${achCount}项录于史馆${achNames.length > 0 ? `——${achNames.slice(0, 3).join('、')}${achNames.length > 3 ? '等' : ''}` : ''}。`);
        }
        verdict = grade === 'unify' ? '功盖千秋，万邦来朝' : '武德既修，文治亦盛';
    } else if (grade === 'decline') {
        paragraphs.push(
            era
                ? `${era}之季，四方不靖。李唐力竭，仅保${cities}城之地，偏安一隅。`
                : '群雄环伺，李唐力竭，仅保数城之地，偏安一隅。'
        );
        paragraphs.push(`史官落笔：非战之罪，时也势也。麾下尚有良将${generals}员，来日再起，未可知也。`);
        verdict = '卷土重来，未可知也';
    } else {
        paragraphs.push('大势已去，宗庙倾颓。李唐之名，遂为陈迹。');
        if (world.chronicle.length > 0) {
            paragraphs.push(`唯一册战史尚在人间，记其${world.chronicle.length}事，任后人评说。`);
        }
        verdict = '是非成败，转头成空';
    }

    // 将领点缀：唐营统率前三名
    const topGenerals = world.generals
        .filter((g) => g.faction === 'tang')
        .map((g) => ({ name: GENERALS.find((d) => d.id === g.id)?.name ?? g.id, command: GENERALS.find((d) => d.id === g.id)?.stats.command ?? 0 }))
        .sort((a, b) => b.command - a.command)
        .slice(0, 3);
    if (topGenerals.length > 0 && grade !== 'defeat') {
        paragraphs.push(`${topGenerals.map((g) => g.name).join('、')}之名，与国同休。`);
    }

    return { paragraphs, verdict };
}
