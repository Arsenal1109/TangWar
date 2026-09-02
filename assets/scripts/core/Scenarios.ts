import type { WorldState } from './WorldState';
import { recordChronicle } from './WorldState';
import type { DifficultyId } from './Difficulty';
import { createAiPacts } from './AIDiplomacy';

/**
 * 开局剧本：同一段历史的不同切入时刻。
 * - taiyuan617「太原起兵」：史实开局，四面群雄（默认）；
 * - guanzhong621「关中既定」：武德四年，唐已据关中陇右巴蜀，隋室名存实亡，
 *   中原只剩郑夏瓦岗三强 + 江南诸国；离 626 年大限更近、强敌更硬。
 */
export interface Scenario {
    id: string;
    name: string;
    year: number;
    desc: string;
    /** 在新建世界上应用剧本差异（城池归属/兵力/年代）。 */
    apply: (world: WorldState) => void;
}

function setFaction(world: WorldState, ids: string[], faction: string, army?: number): void {
    for (const id of ids) {
        const c = world.cities.find((item) => item.id === id);
        if (!c) {
            continue;
        }
        c.faction = faction;
        if (army != null) {
            const total = c.army > 0 ? c.army : 1;
            const scale = army / total;
            for (const key of Object.keys(c.troops) as Array<keyof typeof c.troops>) {
                c.troops[key] = Math.max(1, Math.floor(c.troops[key] * scale));
            }
            c.army = army;
        }
    }
}

export const SCENARIOS: Scenario[] = [
    {
        id: 'taiyuan617',
        name: '太原起兵',
        year: 617,
        desc: '大业十三年 · 以太原一镇起兵，隋室尚在，群雄逐鹿',
        apply: () => undefined // 史实开局即默认世界
    },
    {
        id: 'guanzhong621',
        name: '关中既定',
        year: 621,
        desc: '武德四年 · 唐已据关中陇右，郑夏虎踞中原，决胜在五年之内',
        apply: (world) => {
            world.year = 621;
            // 陇右凉州归唐（史实 619-620 平定）；巴蜀传檄而定
            setFaction(world, ['lanzhou', 'wuwei', 'chengdu'], 'tang');
            // 江都之变（618）：隋室崩灭，残部并入吴（历阳）
            setFaction(world, ['jiangdu'], 'wu', 5000);
            // 郑夏扩军对峙，瓦岗坐大
            setFaction(world, ['luoyang'], 'zheng', 12000);
            setFaction(world, ['ye', 'youzhou', 'qingzhou'], 'xia', 11000);
            setFaction(world, ['xingyang', 'pengcheng'], 'wa', 9000);
        }
    }
];

export const SCENARIO_ORDER: string[] = SCENARIOS.map((s) => s.id);

export function scenarioOf(id: string): Scenario {
    return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

/** 建局入口：难度先行（资源倍率），剧本随后（归属/年代改写不可被难度覆盖）。 */
export function createScenarioWorld(scenarioId: string, difficulty: DifficultyId, cities: WorldState['cities'], generals: WorldState['generals'], diplomacy: WorldState['diplomacy']): WorldState {
    const scenario = scenarioOf(scenarioId);
    const world: WorldState = {
        year: scenario.year,
        seasonIndex: 2,
        turn: 0,
        cities,
        generals,
        diplomacy,
        marches: [],
        difficulty,
        pacts: createAiPacts(),
        chronicle: [],
        achievements: [],
        flags: {},
        log: []
    };
    scenario.apply(world);
    return world;
}

/** 把已建好的世界改写为指定剧本（UI 流程：难度弹窗 → 剧本弹窗 → 应用并建档）。 */
export function applyScenario(world: WorldState, scenarioId: string): Scenario {
    const scenario = scenarioOf(scenarioId);
    scenario.apply(world);
    world.year = scenario.year;
    world.chronicle = [];
    recordChronicle(world, scenario.id === 'guanzhong621' ? '武德四年，唐定关中陇右，传檄巴蜀' : '晋阳誓师，义旗南指');
    return scenario;
}
