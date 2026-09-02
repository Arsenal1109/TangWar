import type { GeneralDef } from '../core/Types';

export const GENERALS: GeneralDef[] = [
    { id: 'lishimin', name: '李世民', title: '秦王 · 天策上将', faction: 'tang', loyalty: 100, stats: { command: 98, politics: 70, strategy: 92, valor: 90, prestige: 95 }, trait: 'tiance' },
    { id: 'liyuan', name: '李渊', title: '唐高祖', faction: 'tang', loyalty: 100, stats: { command: 60, politics: 92, strategy: 80, valor: 40, prestige: 90 } },
    { id: 'lijng', name: '李靖', title: '卫国公 · 名将', faction: 'tang', loyalty: 88, stats: { command: 96, politics: 66, strategy: 95, valor: 70, prestige: 85 }, trait: 'junshen' },
    { id: 'liuwenjing', name: '刘文静', title: '谋臣', faction: 'tang', loyalty: 80, stats: { command: 60, politics: 90, strategy: 93, valor: 45, prestige: 78 }, trait: 'mouzhu' },
    { id: 'peiji', name: '裴寂', title: '尚书右仆射', faction: 'tang', loyalty: 82, stats: { command: 55, politics: 92, strategy: 80, valor: 35, prestige: 75 } },
    { id: 'liyuanji', name: '李元吉', title: '齐王', faction: 'tang', loyalty: 70, stats: { command: 70, politics: 45, strategy: 48, valor: 82, prestige: 55 } },
    { id: 'zhangsunwuji', name: '长孙无忌', title: '赵国公 · 谋臣', faction: 'tang', loyalty: 90, stats: { command: 55, politics: 95, strategy: 88, valor: 40, prestige: 82 } },
    { id: 'zhangsunhuanghou', name: '长孙皇后', title: '文德皇后', faction: 'tang', loyalty: 100, stats: { command: 10, politics: 85, strategy: 70, valor: 10, prestige: 88 } },
    { id: 'fangxuanling', name: '房玄龄', title: '中书令 · 名相', faction: 'tang', loyalty: 90, stats: { command: 45, politics: 96, strategy: 90, valor: 30, prestige: 84 }, trait: 'wangzuo' },
    { id: 'chengyaojin', name: '程咬金', title: '卢国公 · 勇将', faction: 'tang', loyalty: 85, stats: { command: 78, politics: 30, strategy: 45, valor: 95, prestige: 80 } },
    { id: 'qinqiong', name: '秦琼', title: '胡国公 · 猛将', faction: 'tang', loyalty: 88, stats: { command: 82, politics: 25, strategy: 50, valor: 97, prestige: 82 } },
    { id: 'yuchigong', name: '尉迟恭', title: '鄂国公 · 虎将', faction: 'tang', loyalty: 88, stats: { command: 84, politics: 20, strategy: 42, valor: 98, prestige: 84 } },
    // —— 群雄将领（各势力主君 + 主要战将），供战斗统率、离间/收买目标与历史事件使用 ——
    { id: 'yangguang', name: '杨广', title: '隋炀帝', faction: 'sui', loyalty: 100, stats: { command: 55, politics: 40, strategy: 50, valor: 35, prestige: 70 } },
    { id: 'yuhuaji', name: '宇文化及', title: '许国公 · 江都宫变', faction: 'sui', loyalty: 60, stats: { command: 62, politics: 45, strategy: 55, valor: 65, prestige: 55 } },
    { id: 'limi', name: '李密', title: '魏公 · 瓦岗之主', faction: 'wa', loyalty: 85, stats: { command: 85, politics: 75, strategy: 92, valor: 78, prestige: 82 } },
    { id: 'xushiji', name: '徐世勣', title: '瓦岗 · 大将', faction: 'wa', loyalty: 82, stats: { command: 88, politics: 70, strategy: 85, valor: 75, prestige: 78 }, trait: 'tiebi' },
    { id: 'shanxiongxin', name: '单雄信', title: '瓦岗 · 飞将', faction: 'wa', loyalty: 80, stats: { command: 80, politics: 20, strategy: 45, valor: 93, prestige: 72 } },
    { id: 'wangshichong', name: '王世充', title: '郑王 · 僭号洛阳', faction: 'zheng', loyalty: 90, stats: { command: 82, politics: 78, strategy: 85, valor: 70, prestige: 75 }, trait: 'tiebi' },
    { id: 'doujiande', name: '窦建德', title: '夏王 · 河北义师', faction: 'xia', loyalty: 92, stats: { command: 86, politics: 70, strategy: 72, valor: 88, prestige: 85 } },
    { id: 'liuheita', name: '刘黑闼', title: '夏 · 骁将', faction: 'xia', loyalty: 86, stats: { command: 84, politics: 22, strategy: 52, valor: 90, prestige: 60 } },
    { id: 'gaoyaxian', name: '高雅贤', title: '夏 · 猛将', faction: 'xia', loyalty: 80, stats: { command: 76, politics: 20, strategy: 38, valor: 86, prestige: 55 } },
    { id: 'xiaoji', name: '萧铣', title: '梁王 · 江陵', faction: 'chu', loyalty: 78, stats: { command: 60, politics: 65, strategy: 55, valor: 40, prestige: 60 } },
    { id: 'xueju', name: '薛举', title: '西秦霸王', faction: 'qin', loyalty: 88, stats: { command: 84, politics: 40, strategy: 60, valor: 90, prestige: 72 } },
    { id: 'xuerengao', name: '薛仁杲', title: '西秦 · 世子', faction: 'qin', loyalty: 75, stats: { command: 72, politics: 15, strategy: 40, valor: 88, prestige: 55 } },
    { id: 'ligui', name: '李轨', title: '凉帝 · 河西', faction: 'liang', loyalty: 76, stats: { command: 55, politics: 60, strategy: 50, valor: 45, prestige: 58 } },
    { id: 'liuwuzhou', name: '刘武周', title: '定杨可汗 · 马邑', faction: 'liu', loyalty: 84, stats: { command: 78, politics: 40, strategy: 62, valor: 80, prestige: 68 } },
    { id: 'songjingang', name: '宋金刚', title: '定杨 · 骁将', faction: 'liu', loyalty: 80, stats: { command: 82, politics: 25, strategy: 58, valor: 85, prestige: 62 } },
    { id: 'gaokaidao', name: '高开道', title: '燕王 · 渔阳', faction: 'yan', loyalty: 72, stats: { command: 70, politics: 20, strategy: 40, valor: 82, prestige: 55 } },
    { id: 'dufuwei', name: '杜伏威', title: '吴王 · 江淮', faction: 'wu', loyalty: 80, stats: { command: 80, politics: 55, strategy: 65, valor: 85, prestige: 70 } },
    { id: 'shenfaxing', name: '沈法兴', title: '梁王 · 江南', faction: 'shen', loyalty: 70, stats: { command: 55, politics: 50, strategy: 45, valor: 50, prestige: 52 } },
    { id: 'linshihong', name: '林士弘', title: '楚帝 · 鄱阳', faction: 'lin', loyalty: 74, stats: { command: 58, politics: 45, strategy: 50, valor: 55, prestige: 54 } },
    { id: 'weizheng', name: '魏征', title: '在野 · 谏议之士', faction: 'none', loyalty: 1, stats: { command: 40, politics: 92, strategy: 86, valor: 30, prestige: 70 }, trait: 'mouzhu' },
    { id: 'duruhui', name: '杜如晦', title: '在野 · 王佐之才', faction: 'none', loyalty: 1, stats: { command: 45, politics: 95, strategy: 92, valor: 25, prestige: 74 } },
    { id: 'houjunji', name: '侯君集', title: '在野 · 骁锐之将', faction: 'none', loyalty: 1, stats: { command: 84, politics: 30, strategy: 58, valor: 90, prestige: 64 } },
    { id: 'sudingfang', name: '苏定方', title: '在野 · 河北骁将', faction: 'none', loyalty: 1, stats: { command: 88, politics: 25, strategy: 62, valor: 95, prestige: 66 } }
];

/** 各势力开局的都城/驻地将领（敌将自动到任，唐将留给玩家任命）。 */
export const INITIAL_GENERAL_CITY: Record<string, string> = {
    taiyuan: 'lishimin',
    changan: 'liyuan',
    jiangdu: 'yangguang',
    luoyang: 'wangshichong',
    xingyang: 'limi',
    ye: 'doujiande',
    jiangling: 'xiaoji',
    lanzhou: 'xueju',
    wuwei: 'ligui',
    mayi: 'liuwuzhou',
    shuofang: 'songjingang',
    yuyang: 'gaokaidao',
    lishan: 'dufuwei',
    yuzhang: 'linshihong',
    jiankang: 'shenfaxing',
    pengcheng: 'shanxiongxin',
    youzhou: 'liuheita',
    qingzhou: 'gaoyaxian'
};

export function getGeneral(id: string): GeneralDef {
    const g = GENERALS.find((item) => item.id === id);
    if (!g) {
        throw new Error(`未知将领: ${id}`);
    }
    return g;
}
