import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState } from '../assets/scripts/core/Diplomacy';
import { runWorldTurn, collectAllyTribute } from '../assets/scripts/core/TurnFlow';
import {
    availableTalents, recruitCost, recruitTalent, resolveLoyaltyTurnover,
    announceTalents, talentOffer, wandererDefs, LOYALTY_RISK_THRESHOLD
} from '../assets/scripts/core/TalentSystem';
import { rollRandomEvent } from '../assets/scripts/core/RandomEvents';
import { decideFactions } from '../assets/scripts/core/AI';
import { updateAiDiplomacy } from '../assets/scripts/core/AIDiplomacy';
import { createMarch } from '../assets/scripts/core/MarchSystem';
import { getCity } from '../assets/scripts/data/Cities';
import { GENERALS } from '../assets/scripts/data/Generals';
import { getFaction } from '../assets/scripts/data/Factions';

const LOW = () => 0.01;
const HIGH = () => 0.99;

function freshWorld() {
    return createWorld(618, createCityStates(), createGeneralStates(), createDiplomacyState());
}

describe('TalentSystem 在野豪杰', () => {
    it('数据层：四位在野豪杰（魏征/杜如晦/侯君集/苏定方），各有五维', () => {
        const wanderers = wandererDefs();
        expect(wanderers.map((g) => g.id).sort()).toEqual(['duruhui', 'houjunji', 'sudingfang', 'weizheng']);
        for (const g of wanderers) {
            expect(GENERALS.find((x) => x.id === g.id)).toBeTruthy();
            expect(g.stats.command + g.stats.strategy + g.stats.valor).toBeGreaterThan(150);
        }
    });

    it('availableTalents/talentOffer：开局四人皆在野，费用随五维', () => {
        const world = freshWorld();
        const talents = availableTalents(world);
        expect(talents).toHaveLength(4);
        const offer = talentOffer(world, 'duruhui');
        expect(offer.available).toBe(true);
        expect(offer.cost).toBeGreaterThan(550); // 王佐之才千金难求
        expect(recruitCost(world.generals.find((g) => g.id === 'weizheng')!)).toBeGreaterThan(500);
        // 已所属者不可延请
        expect(talentOffer(world, 'lijng').available).toBe(false);
    });

    it('recruitTalent：扣金、改旗归唐、忠诚随唐势、记史册', () => {
        const world = freshWorld();
        const goldBefore = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        const result = recruitTalent(world, 'sudingfang');
        expect(result.ok).toBe(true);
        const cost = recruitCost(world.generals.find((g) => g.id === 'sudingfang')!);
        const goldAfter = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        expect(goldBefore - goldAfter).toBe(cost);
        const g = world.generals.find((x) => x.id === 'sudingfang')!;
        expect(g.faction).toBe('tang');
        expect(g.loyalty).toBeGreaterThanOrEqual(55);
        expect(world.log.some((l) => l.includes('归唐'))).toBe(true);
        expect(world.chronicle.some((l) => l.includes('苏定方'))).toBe(true);
        // 已招募者不再在野
        expect(availableTalents(world).map((t) => t.id)).not.toContain('sudingfang');
    });

    it('recruitTalent：府库不足则拒之门外', () => {
        const world = freshWorld();
        for (const c of world.cities) {
            if (c.faction === 'tang') c.gold = 10;
        }
        const result = recruitTalent(world, 'weizheng');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('府库不足');
        expect(world.generals.find((g) => g.id === 'weizheng')!.faction).toBe('none');
    });

    it('announceTalents：有在野者写求贤令，无则沉默', () => {
        const world = freshWorld();
        announceTalents(world);
        expect(world.log.some((l) => l.includes('求贤令'))).toBe(true);
        const world2 = freshWorld();
        for (const c of world2.cities) {
            if (c.faction === 'tang') c.gold += 3000; // 充足府库延请全部
        }
        for (const t of [...availableTalents(world2)]) {
            recruitTalent(world2, t.id);
        }
        expect(availableTalents(world2)).toHaveLength(0);
        world2.log = [];
        announceTalents(world2);
        expect(world2.log.some((l) => l.includes('求贤令'))).toBe(false);
    });
});

describe('TalentSystem 年末忠诚结算', () => {
    it('敌将忠诚低落：LOW 随机下弃暗投明归唐', () => {
        const world = freshWorld();
        const song = world.generals.find((g) => g.id === 'songjingang')!; // 刘武周骁将
        song.loyalty = 30;
        const events = resolveLoyaltyTurnover(world, LOW);
        expect(events.some((e) => e.kind === 'joins-tang' && e.general === 'songjingang')).toBe(true);
        expect(song.faction).toBe('tang');
        expect(song.loyalty).toBe(65);
        expect(world.chronicle.some((l) => l.includes('弃暗投明'))).toBe(true);
    });

    it('敌将忠诚 < 15：遁入山林离场，守将任命清空', () => {
        const world = freshWorld();
        const gaoyaxian = world.generals.find((g) => g.id === 'gaoyaxian')!;
        gaoyaxian.loyalty = 10;
        const ye = world.cities.find((c) => c.id === 'ye')!;
        ye.generalId = 'gaoyaxian';
        const events = resolveLoyaltyTurnover(world, LOW);
        expect(events.some((e) => e.kind === 'flees-tang' && e.general === 'gaoyaxian')).toBe(true);
        expect(world.generals.some((g) => g.id === 'gaoyaxian')).toBe(false);
        expect(ye.generalId).toBeNull();
    });

    it('唐将忠诚低落：叛唐投奔敌对势力', () => {
        const world = freshWorld();
        const peiji = world.generals.find((g) => g.id === 'peiji')!; // 唐臣
        peiji.loyalty = 20;
        const events = resolveLoyaltyTurnover(world, LOW);
        expect(events.some((e) => e.kind === 'flees-player' && e.general === 'peiji')).toBe(true);
        expect(peiji.faction).not.toBe('tang');
        expect(peiji.faction).not.toBe('none');
    });

    it('忠诚达标的将领安然无恙；概率判定与忠诚挂钩', () => {
        const world = freshWorld();
        resolveLoyaltyTurnover(world, LOW);
        const safe = world.generals.filter((g) => g.loyalty >= LOYALTY_RISK_THRESHOLD);
        expect(safe.length).toBeGreaterThan(20);
        // 忠诚 39 只有 1/80 概率：HIGH 随机下不动
        const edge = world.generals.find((g) => g.id === 'lijng')!;
        edge.loyalty = 39;
        const events = resolveLoyaltyTurnover(world, HIGH);
        expect(events).toHaveLength(0);
        expect(edge.faction).toBe('tang');
    });
});

describe('RandomEvents 灾异丰稔', () => {
    it('首两回合与未掷中时不出事件', () => {
        const world = freshWorld();
        world.turn = 1;
        expect(rollRandomEvent(world, LOW)).toBeNull();
        world.turn = 5;
        expect(rollRandomEvent(world, HIGH)).toBeNull(); // HIGH：0.99 ≥ 0.12 门槛
    });

    it('触发时效果落城并记史册', () => {
        const world = freshWorld();
        world.turn = 10;
        // 序列：门槛 0.01 < 0.12 ✓；权重掷 0.01*13=0.13 → 蝗灾(weight 3)；选城 0.01 → 首城
        const message = rollRandomEvent(world, LOW);
        expect(message).not.toBeNull();
        expect(world.log).toContain(message);
        expect(world.chronicle.some((l) => l!.includes(message!))).toBe(true);
        // 蝗灾已扣粮：首城粮食低于上限（tier-1 满粮 3000 的 75%）
        const first = world.cities[0];
        expect(first.food).toBeLessThan(3000);
    });

    it('名马入贡：唐城骁骑+200', () => {
        const world = freshWorld();
        world.turn = 10;
        // 权重掷 0.99：cum 3+2+2+3+2=12, 12→13 落在 weight1（名马）
        const seq = [0.01, 0.952, 0.01]; // 门槛 → 权重(0.952*13≈12.4→horses) → 选城
        let i = 0;
        const message = rollRandomEvent(world, () => seq[i++] ?? 0.5);
        expect(message).toContain('名马');
        const tangCity = world.cities.find((c) => c.faction === 'tang')!;
        expect(tangCity.troops.qibing).toBeGreaterThan(0);
    });
});

describe('盟约的实value', () => {
    it('唐之盟邦不攻唐土', () => {
        const world = freshWorld();
        // 使 wa（瓦岗）与唐结盟，并让 wa 邻接唐城
        world.diplomacy.allies.push('wa');
        const actions = decideFactions(world, LOW);
        for (const a of actions.filter((x) => x.faction === 'wa' && x.kind === 'expand')) {
            const target = world.cities.find((c) => c.id === a.targetCityId);
            expect(target?.faction).not.toBe('tang');
        }
    });

    it('讨唐合纵不拉唐之盟邦入伙', () => {
        const world = freshWorld();
        for (const c of world.cities) {
            if (!['taiyuan', 'changan', 'jinyang', 'mayi', 'shuofang', 'youzhou', 'qingzhou'].includes(c.id)) {
                c.faction = 'tang';
            }
        }
        // 使最弱的两家之一（将入盟者）先与唐结盟
        world.diplomacy.allies.push('sui', 'wa');
        updateAiDiplomacy(world, LOW);
        if (world.pacts.coalition && world.pacts.coalition.target === 'tang') {
            for (const m of world.pacts.coalition.members) {
                expect(world.diplomacy.allies).not.toContain(m);
            }
        }
    });

    it('岁首盟邦岁贡：盟邦存则输金 120，灭亡则无', () => {
        const world = freshWorld();
        world.diplomacy.allies.push('wa', 'sui');
        const goldBefore = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        const lines = collectAllyTribute(world);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('120');
        const goldAfter = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        expect(goldAfter - goldBefore).toBe(240);
        // 邦交深化
        expect(world.diplomacy.relations.wa).toBe(20 + 2);
        // 盟邦灭亡后无岁贡
        for (const c of world.cities) {
            if (c.faction === 'sui') c.faction = 'wu';
        }
        const lines2 = collectAllyTribute(world);
        expect(lines2).toHaveLength(1);
    });
});

describe('冬季行军迟缓', () => {
    it('冬季出征 +1 回合，其余季节不加', () => {
        const from = getCity('taiyuan');
        const to = getCity('changan');
        const troops = { fubing: 1000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        const summer = createMarch('m1', from, to, troops, 1);
        const winter = createMarch('m2', from, to, troops, 3);
        expect(winter.turnsLeft).toBe(summer.turnsLeft + 1);
        const noSeason = createMarch('m3', from, to, troops);
        expect(noSeason.turnsLeft).toBe(summer.turnsLeft);
    });
});

describe('TurnFlow 节令装配', () => {
    it('正月出求贤令；冬末结算忠诚（LOW 下敌将归唐）', () => {
        const world = freshWorld();
        world.seasonIndex = 0;
        world.turn = 4;
        const out = runWorldTurn(world, LOW);
        expect(out.log.some((l) => l.includes('求贤令'))).toBe(true);

        const world2 = freshWorld();
        const song = world2.generals.find((g) => g.id === 'songjingang')!;
        song.loyalty = 30;
        world2.seasonIndex = 3;
        world2.turn = 7;
        const out2 = runWorldTurn(world2, LOW);
        expect(song.faction).toBe('tang'); // 岁末忠诚结算：弃暗投明
        expect(out2.log.some((l) => l.includes('弃暗投明'))).toBe(true);
    });
});
