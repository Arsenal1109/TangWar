// 共享基础类型（引擎无关，纯逻辑）
export type Season = '春' | '夏' | '秋' | '冬';

export type FactionPersonality = 'aggressive' | 'defensive' | 'scheming' | 'expansionist';

export interface FactionDef {
    id: string;
    name: string;        // 例：'大唐·李渊'
    color: string;       // 地图势力色，例：'#b03a2e'
    personality: FactionPersonality;
}

export interface CityDef {
    id: string;
    name: string;
    x: number;           // 舆图 viewBox 640x560 内坐标
    y: number;
    faction: string;     // FactionDef.id
    tier: number;        // 1=州府，0=郡县
}

export interface GeneralStats {
    command: number;     // 统军
    politics: number;    // 政务
    strategy: number;    // 谋略
    valor: number;       // 勇武
    prestige: number;    // 威望
}

export interface GeneralDef {
    id: string;
    name: string;
    title: string;       // 称谓，例：'秦王 · 天策上将'
    faction: string;
    stats: GeneralStats;
    loyalty: number;     // 忠诚 1..100
}
