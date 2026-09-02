import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import {
    appointDuyun, removeDuyun, duyunOf, runDuyunCampaigns, DUYUN_MAX, DUYUN_ODDS
} from '../assets/scripts/core/GovernorSystem';
import { buildEpilogue } from '../assets/scripts/core/Epilogue';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { proclaimEmperor } from '../assets/scripts/core/ImperialSystem';
import { assignGeneral } from '../assets/scripts/core/GeneralSystem';
import type { WorldState } from '../assets/scripts/core/WorldState';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

describe('都督府', () => {
    it('委任前置：须唐城 + 唐将 + 授职驻于该城', () => {
        const world = freshWorld();
        const lishimin = world.generals.find((g) => g.id === 'lishimin')!;
        // 未授职
        const r1 = appointDuyun(world, 'taiyuan', 'lishimin');
        expect(r1.ok).toBe(false);
        expect(r1.reason).toContain('授职');
        // 授职于太原
        assignGeneral(lishimin, 'taiyuan', 'commander');
        const r2 = appointDuyun(world, 'taiyuan', 'lishimin');
        expect(r2.ok).toBe(true);
        expect(duyunOf(world, 'taiyuan')).toBe('lishimin');
        // 非唐将
        const wc = world.generals.find((g) => g.faction === 'zheng')!;
        const r3 = appointDuyun(world, 'taiyuan', wc.id);
        expect(r3.ok).toBe(false);
        // 非唐城
        const r4 = appointDuyun(world, 'mayi', 'lishimin');
        expect(r4.ok).toBe(false);
    });

    it('至多两员都督；同将不可再拜；可罢免', () => {
        const world = freshWorld();
        const tangGens = world.generals.filter((g) => g.faction === 'tang' && ['taiyuan', 'jinyang'].includes(g.id));
        // 开局唐将各有预设驻城？——直接授职到任意两座唐城
        const tangCities = world.cities.filter((c) => c.faction === 'tang');
        const gs = world.generals.filter((g) => g.faction === 'tang' && !g.assignment).slice(0, 3);
        assignGeneral(gs[0], tangCities[0].id, 'commander');
        assignGeneral(gs[1], tangCities[1].id, 'commander');
        assignGeneral(gs[2], tangCities[2].id, 'commander');
        expect(appointDuyun(world, tangCities[0].id, gs[0].id).ok).toBe(true);
        expect(appointDuyun(world, tangCities[1].id, gs[1].id).ok).toBe(true);
        expect(appointDuyun(world, tangCities[2].id, gs[2].id).ok).toBe(false);
        expect(appointDuyun(world, tangCities[0].id, gs[0].id).ok).toBe(false); // 已是都督
        expect(Object.keys(world.duyuns!)).toHaveLength(DUYUN_MAX);
        const rm = removeDuyun(world, tangCities[0].id);
        expect(rm.ok).toBe(true);
        expect(duyunOf(world, tangCities[0].id)).toBeNull();
        removeDuyun(world, tangCities[1].id);
        expect(world.duyuns).toEqual({});
    });

    it('胜算六成即自决出讨：弱敌当前 LOW 必克城，不占军议（policyUsed 不变）', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        const lishimin = world.generals.find((g) => g.id === 'lishimin')!;
        assignGeneral(lishimin, 'taiyuan', 'commander');
        appointDuyun(world, 'taiyuan', 'lishimin');
        // 朔方清空守备 → 胜算满
        const shuofang = world.cities.find((c) => c.id === 'shuofang')!;
        shuofang.generalId = null;
        shuofang.army = 0;
        for (const t of Object.keys(shuofang.troops) as Array<keyof typeof shuofang.troops>) {
            shuofang.troops[t] = 0;
        }
        shuofang.defense = 0;
        taiyuan.food = 2000;
        const beforeFood = taiyuan.food;
        const lines = runDuyunCampaigns(world, LOW);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('自决出讨');
        expect(shuofang.faction).toBe('tang');
        expect(taiyuan.food).toBe(beforeFood - 400); // 自筹粮秣
        expect(taiyuan.policyUsed).toBe(false); // 不占军议
        expect(world.chronicle.some((l) => l.includes('都督出讨'))).toBe(true);
    });

    it('胜算不足则按兵不动；粮秣不继则不师', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        const lishimin = world.generals.find((g) => g.id === 'lishimin')!;
        assignGeneral(lishimin, 'taiyuan', 'commander');
        appointDuyun(world, 'taiyuan', 'lishimin');
        // 四邻皆满防强敌 → 胜算不足六成，按兵不动
        for (const c of world.cities) {
            if (c.faction !== 'tang') {
                c.defense = 9;
                c.army = 4000;
                c.troops = { fubing: 4000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
            }
        }
        let lines = runDuyunCampaigns(world, LOW);
        expect(lines).toHaveLength(0);
        expect(world.cities.find((c) => c.id === 'mayi')!.faction).toBe('liu');
        // 粮秣不继
        const shuofang = world.cities.find((c) => c.id === 'shuofang')!;
        shuofang.army = 0;
        shuofang.defense = 0;
        taiyuan.food = 300;
        lines = runDuyunCampaigns(world, LOW);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('粮秣不继');
        expect(shuofang.faction).not.toBe('tang');
    });

    it('都督失效自清：城池易主后府中除名', () => {
        const world = freshWorld();
        const taiyuan = world.cities.find((c) => c.id === 'taiyuan')!;
        const lishimin = world.generals.find((g) => g.id === 'lishimin')!;
        assignGeneral(lishimin, 'taiyuan', 'commander');
        appointDuyun(world, 'taiyuan', 'lishimin');
        taiyuan.faction = 'wa'; // 太原陷落
        const lines = runDuyunCampaigns(world, LOW);
        expect(world.duyuns).toEqual({});
        expect(lines).toHaveLength(0);
    });

    it('整回合流转：都督战役日志入回合播报；duyuns 随档持久化', () => {
        const world = freshWorld();
        const lishimin = world.generals.find((g) => g.id === 'lishimin')!;
        assignGeneral(lishimin, 'taiyuan', 'commander');
        appointDuyun(world, 'taiyuan', 'lishimin');
        world.turn = 9;
        world.seasonIndex = 1;
        const out = runWorldTurn(world, HIGH);
        expect(Array.isArray(out.log)).toBe(true);
        const save = serializeSave(world, 5);
        const world2 = freshWorld();
        applySave(world2, save);
        expect(world2.duyuns).toEqual({ taiyuan: 'lishimin' });
        // 旧档无 duyuns → 空对象
        const legacy = { ...save, duyuns: undefined };
        const world3 = freshWorld();
        applySave(world3, legacy as typeof save);
        expect(world3.duyuns).toEqual({});
    });
});

describe('结局铭文', () => {
    it('一统：年号入铭、功业列举、总评金句', () => {
        const world = freshWorld();
        world.eraName = '武德';
        world.flags['proclaimed'] = true;
        world.achievements.push('first-victory', 'city-taker', 'seek-talent', 'full-treasury');
        const epi = buildEpilogue(world, 'unify');
        expect(epi.paragraphs[0]).toContain('武德');
        expect(epi.paragraphs.some((p) => p.includes('功业4项'))).toBe(true);
        expect(epi.paragraphs.some((p) => p.includes('首战告捷'))).toBe(true);
        expect(epi.verdict.length).toBeGreaterThan(4);
    });

    it('未称帝的一统铭文仍成章；偏安有再起之笔', () => {
        const w1 = freshWorld();
        const epi1 = buildEpilogue(w1, 'unify');
        expect(epi1.paragraphs[0]).toContain('晋阳举义');
        const w2 = freshWorld();
        const epi2 = buildEpilogue(w2, 'decline');
        expect(epi2.paragraphs.some((p) => p.includes('偏安一隅'))).toBe(true);
        expect(epi2.verdict).toContain('卷土重来');
    });

    it('覆亡：铭文悲怆且提及战史卷数', () => {
        const world = freshWorld();
        world.chronicle.push('618年春 · 太原起兵');
        const epi = buildEpilogue(world, 'defeat');
        expect(epi.paragraphs[0]).toContain('宗庙倾颓');
        expect(epi.paragraphs.some((p) => p.includes('1事'))).toBe(true);
    });

    it('称帝整回合后铭文可用（冒烟）', () => {
        const world = freshWorld();
        for (const c of world.cities) {
            if (c.faction !== 'tang') {
                c.faction = 'tang';
            }
        }
        proclaimEmperor(world, 'wude');
        const epi = buildEpilogue(world, 'unify');
        expect(epi.paragraphs.length).toBeGreaterThanOrEqual(2);
    });
});
