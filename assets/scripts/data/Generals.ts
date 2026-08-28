import type { GeneralDef } from '../core/Types';

export const GENERALS: GeneralDef[] = [
    { id: 'lishimin', name: '李世民', title: '秦王 · 天策上将', faction: 'tang', loyalty: 100, stats: { command: 98, politics: 70, strategy: 92, valor: 90, prestige: 95 } },
    { id: 'liyuan', name: '李渊', title: '唐高祖', faction: 'tang', loyalty: 100, stats: { command: 60, politics: 92, strategy: 80, valor: 40, prestige: 90 } },
    { id: 'lijng', name: '李靖', title: '卫国公 · 名将', faction: 'tang', loyalty: 88, stats: { command: 96, politics: 66, strategy: 95, valor: 70, prestige: 85 } },
    { id: 'liuwenjing', name: '刘文静', title: '谋臣', faction: 'tang', loyalty: 80, stats: { command: 60, politics: 90, strategy: 93, valor: 45, prestige: 78 } },
    { id: 'peiji', name: '裴寂', title: '尚书右仆射', faction: 'tang', loyalty: 82, stats: { command: 55, politics: 92, strategy: 80, valor: 35, prestige: 75 } },
    { id: 'liyuanji', name: '李元吉', title: '齐王', faction: 'tang', loyalty: 70, stats: { command: 70, politics: 45, strategy: 48, valor: 82, prestige: 55 } },
    { id: 'zhangsunwuji', name: '长孙无忌', title: '赵国公 · 谋臣', faction: 'tang', loyalty: 90, stats: { command: 55, politics: 95, strategy: 88, valor: 40, prestige: 82 } },
    { id: 'zhangsunhuanghou', name: '长孙皇后', title: '文德皇后', faction: 'tang', loyalty: 100, stats: { command: 10, politics: 85, strategy: 70, valor: 10, prestige: 88 } },
    { id: 'fangxuanling', name: '房玄龄', title: '中书令 · 名相', faction: 'tang', loyalty: 90, stats: { command: 45, politics: 96, strategy: 90, valor: 30, prestige: 84 } },
    { id: 'chengyaojin', name: '程咬金', title: '卢国公 · 勇将', faction: 'tang', loyalty: 85, stats: { command: 78, politics: 30, strategy: 45, valor: 95, prestige: 80 } },
    { id: 'qinqiong', name: '秦琼', title: '胡国公 · 猛将', faction: 'tang', loyalty: 88, stats: { command: 82, politics: 25, strategy: 50, valor: 97, prestige: 82 } },
    { id: 'yuchigong', name: '尉迟恭', title: '鄂国公 · 虎将', faction: 'tang', loyalty: 88, stats: { command: 84, politics: 20, strategy: 42, valor: 98, prestige: 84 } }
];

export function getGeneral(id: string): GeneralDef {
    const g = GENERALS.find((item) => item.id === id);
    if (!g) {
        throw new Error(`未知将领: ${id}`);
    }
    return g;
}
