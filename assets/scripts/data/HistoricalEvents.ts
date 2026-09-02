import type { WorldState } from '../core/WorldState';

export interface WorldEventDef {
    id: string;
    name: string;
    message: string;
    condition: (w: WorldState) => boolean;
    run: (w: WorldState) => void; // 副作用（打标志 / 记数值）
}

/**
 * 历史事件链（依规格书 §8）：以史实为骨架、以天下态势为触发条件。
 * 玩家的行动会改变版图，从而让历史事件自然分支——条件不满足就永不触发。
 */
export const HISTORICAL_EVENTS: WorldEventDef[] = [
    {
        id: 'tang-enter-changan',
        name: '入主长安',
        message: '李渊入主长安，代隋称帝（武德元年），隋唐易祚',
        condition: (w) => w.year >= 618 && w.cities.some((c) => c.id === 'changan' && c.faction === 'tang'),
        run: (w) => { w.flags['chengdi'] = true; }
    },
    {
        id: 'wa-strong',
        name: '瓦岗鼎盛',
        message: '李密破宇文化及归师，瓦岗声势大振，中原震动',
        condition: (w) => w.year >= 617
            && w.cities.filter((c) => c.faction === 'wa').length >= 2,
        run: (w) => {
            w.flags['waPeak'] = true;
            // 瓦岗全境养锐：精兵入营
            for (const c of w.cities) {
                if (c.faction === 'wa') {
                    c.troops.jingbing += 1500;
                    c.army += 1500;
                }
            }
        }
    },
    {
        id: 'sui-down',
        name: '江都宫变',
        message: '宇文化及弑杨广于江都，隋室名存实亡，江都守军哗变降望',
        condition: (w) => w.year >= 618,
        run: (w) => {
            w.flags['suiDown'] = true;
            // 隋土军心崩解：守军减员、民心下坠
            for (const c of w.cities) {
                if (c.faction === 'sui') {
                    const loss = Math.min(c.army, 1500);
                    c.troops.fubing = Math.max(0, c.troops.fubing - loss);
                    c.army -= loss;
                    c.morale = Math.max(0, c.morale - 15);
                }
            }
        }
    },
    {
        id: 'liu-south-threat',
        name: '刘武周南下',
        message: '刘武周引突厥之众南下，兵锋直指太原，河东告急',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.faction === 'liu' && c.army > 0),
        run: (w) => {
            w.flags['liuThreat'] = true;
            // 定杨全军动员：南下兵团成军
            for (const c of w.cities) {
                if (c.faction === 'liu') {
                    c.troops.qibing += 1200;
                    c.army += 1200;
                }
            }
        }
    },
    {
        id: 'wang-chengdi',
        name: '王世充称帝',
        message: '王世充据洛阳，僭号称郑帝，与唐室分庭抗礼',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.id === 'luoyang' && c.faction === 'zheng'),
        run: (w) => {
            w.flags['zhengChengdi'] = true;
            // 僭号激起同仇：洛阳城防大增，但民心渐失
            const luoyang = w.cities.find((c) => c.id === 'luoyang');
            if (luoyang) {
                luoyang.defense += 6;
                luoyang.morale = Math.max(0, luoyang.morale - 8);
            }
        }
    },
    {
        id: 'wa-collapse',
        name: '瓦岗败亡',
        message: '李密新败，瓦岗众将离散，魏国土崩瓦解',
        condition: (w) => w.year >= 618 && w.cities.some((c) => (c.id === 'xingyang' || c.id === 'pengcheng'))
            && !w.cities.some((c) => c.id === 'xingyang' && c.faction === 'wa')
            && !w.cities.some((c) => c.id === 'pengcheng' && c.faction === 'wa'),
        run: (w) => {
            w.flags['waFallen'] = true;
            // 旧瓦岗城池军心不稳
            for (const id of ['xingyang', 'pengcheng']) {
                const c = w.cities.find((x) => x.id === id);
                if (c && c.faction !== 'tang') {
                    c.morale = Math.max(0, c.morale - 12);
                }
            }
        }
    },
    {
        id: 'hulaoguan-victory',
        name: '虎牢关大捷',
        message: '秦王据虎牢，一战擒双王：窦建德就擒，王世充举洛阳降唐',
        condition: (w) => w.year >= 620
            && w.cities.some((c) => c.id === 'luoyang' && c.faction === 'tang'),
        run: (w) => {
            w.flags['hulao'] = true;
            // 天下震动：唐室声望大增，洛阳入金
            const luoyang = w.cities.find((c) => c.id === 'luoyang');
            if (luoyang) {
                luoyang.gold += 800;
                luoyang.morale = Math.min(100, luoyang.morale + 15);
            }
        }
    },
    {
        id: 'xia-collapse',
        name: '夏国覆灭',
        message: '窦建德败亡，河北诸州望风归唐',
        condition: (w) => w.year >= 620
            && w.cities.some((c) => (c.id === 'ye' || c.id === 'youzhou'))
            && !w.cities.some((c) => (c.id === 'ye' || c.id === 'youzhou') && c.faction === 'xia'),
        run: (w) => { w.flags['xiaFallen'] = true; }
    },
    {
        id: 'western-pacified',
        name: '陇右归唐',
        message: '薛氏父子授首，陇右、河西相继归唐，西陲底定',
        condition: (w) => w.year >= 618
            && !w.cities.some((c) => c.faction === 'qin')
            && !w.cities.some((c) => c.faction === 'liang'),
        run: (w) => { w.flags['westPacified'] = true; }
    }
];
