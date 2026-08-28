import type { WorldState } from '../core/WorldState';

export interface WorldEventDef {
    id: string;
    name: string;
    message: string;
    condition: (w: WorldState) => boolean;
    run: (w: WorldState) => void; // 副作用（打标志 / 记数值）
}

export const HISTORICAL_EVENTS: WorldEventDef[] = [
    {
        id: 'tang-enter-changan',
        name: '入主长安',
        message: '李渊入主长安，代隋称帝（武德元年），隋唐易祚',
        condition: (w) => w.year === 618 && w.cities.some((c) => c.id === 'changan' && c.faction === 'tang'),
        run: (w) => { w.flags['chengdi'] = true; }
    },
    {
        id: 'sui-down',
        name: '隋室衰微',
        message: '宇文化及弑杨广于江都，隋亡于乱',
        condition: (w) => w.year === 618,
        run: () => { /* 史事记载 */ }
    },
    {
        id: 'liu-takes-jinyang',
        name: '刘武周南下',
        message: '刘武周举兵南下，攻陷晋阳，太原震动',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.id === 'jinyang' && c.faction === 'liu'),
        run: (w) => { w.flags['liuThreat'] = true; }
    },
    {
        id: 'wang-chengdi',
        name: '王世充称帝',
        message: '王世充据洛阳，僭号称郑帝',
        condition: (w) => w.year >= 619 && w.cities.some((c) => c.id === 'luoyang' && c.faction === 'zheng'),
        run: (w) => { w.flags['zhengChengdi'] = true; }
    }
];