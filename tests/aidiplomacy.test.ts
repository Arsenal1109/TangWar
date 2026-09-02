import { describe, it, expect } from 'vitest';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { decideFactions, applyAiActions } from '../assets/scripts/core/AI';
import { runWorldTurn } from '../assets/scripts/core/TurnFlow';
import {
    tickPacts, updateAiDiplomacy, resolveEnvoy, isTrucedWithTang, applyAiSchemes
} from '../assets/scripts/core/AIDiplomacy';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';
import { getFaction } from '../assets/scripts/data/Factions';

const LOW = () => 0.01;
const HIGH = () => 0.99;

/** 构造 liu（刘武周）只剩马邑、其余天下尽归唐土的孤立局面（唯一 AI 势力，随机分支可预测） */
function liuCorneredWorld() {
    const world = createWorld(618, createCityStates(), createGeneralStates());
    for (const c of world.cities) {
        if (c.id !== 'mayi') {
            c.faction = c.id === 'mayi' ? 'liu' : 'tang';
        }
    }
    return world;
}

describe('AIDiplomacy 停战', () => {
    it('停战中的势力不会进攻唐土（马邑被唐土包围时只能养锐）', () => {
        const world = liuCorneredWorld();
        world.pacts.truces.liu = 5;
        const actions = decideFactions(world, LOW);
        const liu = actions.filter((a) => a.faction === 'liu');
        expect(liu).toHaveLength(1);
        expect(liu[0].kind).toBe('reinforce'); // 唯一邻接目标是唐土 → 停战时不出兵
    });

    it('无停战时同一局面会出兵攻唐', () => {
        const world = liuCorneredWorld();
        const actions = decideFactions(world, LOW);
        const liu = actions.find((a) => a.faction === 'liu');
        expect(liu?.kind).toBe('expand');
        expect(liu?.targetCityId).toBeTruthy();
        expect(world.cities.find((c) => c.id === liu!.targetCityId)!.faction).toBe('tang');
    });

    it('tickPacts 递减停战；合纵到期自动散盟并写战报', () => {
        const world = createWorld(618, createCityStates());
        world.pacts.truces.liu = 2;
        world.pacts.coalition = { target: 'tang', members: ['liu', 'wa'], turnsLeft: 1 };
        tickPacts(world);
        expect(world.pacts.truces.liu).toBe(1);
        expect(world.pacts.coalition).toBeNull(); // 1 → 0 即期满散盟
        tickPacts(world);
        expect(world.pacts.truces.liu).toBeUndefined();
    });

    it('isTrucedWithTang 只认正数剩余回合', () => {
        const world = createWorld(618, createCityStates());
        world.pacts.truces.wa = 0;
        expect(isTrucedWithTang(world, 'wa')).toBe(false);
        world.pacts.truces.wa = 3;
        expect(isTrucedWithTang(world, 'wa')).toBe(true);
    });
});

describe('AIDiplomacy 合纵', () => {
    it('最强势力占比超阈值时，最弱两家结成合纵并写入战报', () => {
        const world = createWorld(618, createCityStates());
        // 唐吞并大半天下：其余群雄残破 → 合纵目标为 tang
        for (const c of world.cities) {
            if (!['taiyuan', 'changan', 'jinyang', 'mayi', 'shuofang', 'youzhou', 'qingzhou'].includes(c.id)) {
                c.faction = 'tang';
            }
        }
        const offer = updateAiDiplomacy(world, LOW);
        expect(offer).toBeNull(); // LOW 让勒索/求和分支静默，但合纵以日志呈现
        expect(world.pacts.coalition).not.toBeNull();
        expect(world.pacts.coalition!.target).toBe('tang');
        expect(world.pacts.coalition!.members.length).toBe(2);
        expect(world.log.some((l) => l.includes('合纵'))).toBe(true);
    });

    it('占比不足或已有盟约时不再结盟', () => {
        const world = createWorld(618, createCityStates());
        // HIGH 随机压制一切概率分支：初始群雄林立，不应结盟也不应遣使
        const first = updateAiDiplomacy(world, HIGH);
        expect(first).toBeNull();
        expect(world.pacts.coalition).toBeNull();
    });

    it('合纵成员优先攻打盟主之城', () => {
        const world = liuCorneredWorld();
        // wa（瓦岗）与 liu 结盟共讨 tang：liu 的邻接目标全是唐城 → 仍指向唐
        world.pacts.coalition = { target: 'tang', members: ['liu', 'wa'], turnsLeft: 6 };
        const actions = decideFactions(world, LOW);
        const liu = actions.find((a) => a.faction === 'liu');
        expect(liu?.kind).toBe('expand');
        expect(world.cities.find((c) => c.id === liu!.targetCityId)!.faction).toBe('tang');
    });
});

describe('AIDiplomacy 遣使', () => {
    it('孤城弱势力会遣使求和；接受后进入停战', () => {
        const world = liuCorneredWorld();
        for (const c of world.cities) {
            if (c.faction === 'liu') {
                c.army = 100; // 弱旅
            }
        }
        // 唯一 AI 势力 → 无合纵分支；一次 rng 决定求和是否发生
        const offer = updateAiDiplomacy(world, LOW);
        expect(offer).not.toBeNull();
        expect(offer!.kind).toBe('peace');
        expect(offer!.faction).toBe('liu');

        const res = resolveEnvoy(world, offer!, true);
        expect(res.ok).toBe(true);
        expect(world.pacts.truces.liu).toBe(8);
        expect(world.log.some((l) => l.includes('罢兵'))).toBe(true);
    });

    it('勒索只在虎狼难度出现；接受扣唐金、回绝伤邦交', () => {
        const world = liuCorneredWorld();
        world.difficulty = 'hard';
        // liu 兵力压唐（索贿者需 > 0.8 × 唐军），且强到不会求和（≥ 0.6 × 唐军）
        for (const c of world.cities) {
            if (c.faction === 'liu') {
                c.army = 20000;
            } else if (c.faction === 'tang') {
                c.army = 1000;
            }
        }
        // 唯一 AI 势力 → 无合纵分支；0.05 同时满足勒索阈值（< 0.12×1.6）
        const offer = updateAiDiplomacy(world, LOW);
        expect(offer).not.toBeNull();
        expect(offer!.kind).toBe('demand');
        expect(offer!.gold).toBe(300);

        const tangCity = world.cities.filter((c) => c.faction === 'tang').sort((a, b) => b.gold - a.gold)[0];
        const goldBefore = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        const res = resolveEnvoy(world, offer!, true);
        const goldAfter = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.gold, 0);
        expect(res.ok).toBe(true);
        expect(goldBefore - goldAfter).toBe(300);
        expect(goldBefore).toBeGreaterThan(300);
        expect(tangCity.gold).toBeGreaterThanOrEqual(0);
        expect(world.pacts.truces.liu).toBe(6);

        // 回绝：邦交 -20
        const relBefore = world.diplomacy.relations.liu ?? 0;
        resolveEnvoy(world, offer!, false);
        expect(world.diplomacy.relations.liu).toBe(relBefore - 20);
    });

    it('史实与休明难度不触发勒索', () => {
        for (const diff of ['normal', 'easy'] as const) {
            const world = liuCorneredWorld();
            world.difficulty = diff;
            for (const c of world.cities) {
                if (c.faction === 'liu') c.army = 20000;
                else if (c.faction === 'tang') c.army = 500;
            }
            let calls = 0;
            const seq = () => (calls++ < 3 ? 0.9 : 0.01);
            const offer = updateAiDiplomacy(world, seq);
            expect(offer === null || offer.kind === 'peace').toBe(true);
        }
    });

    it('纳金不足时岁币未付、停战不成立', () => {
        const world = liuCorneredWorld();
        world.difficulty = 'hard';
        for (const c of world.cities) {
            if (c.faction === 'liu') c.army = 20000;
            else if (c.faction === 'tang') { c.army = 500; c.gold = 10; } // 唐金合计 200 < 300
        }
        const offer = updateAiDiplomacy(world, LOW)!;
        expect(offer.kind).toBe('demand');
        const res = resolveEnvoy(world, offer, true);
        expect(res.ok).toBe(false);
        expect(world.pacts.truces.liu).toBeUndefined();
    });
});

describe('AIDiplomacy 持久化与回合流', () => {
    it('pacts 随存档 v2 往返', () => {
        const world = createWorld(620, createCityStates());
        world.pacts.truces.liu = 4;
        world.pacts.truces.wa = 1;
        world.pacts.coalition = { target: 'tang', members: ['xia', 'zheng'], turnsLeft: 3 };
        const data = serializeSave(world);
        const restored = createWorld(617, createCityStates());
        applySave(restored, data);
        expect(restored.pacts.truces.liu).toBe(4);
        expect(restored.pacts.coalition!.members).toEqual(['xia', 'zheng']);
        expect(restored.pacts.coalition!.turnsLeft).toBe(3);
    });

    it('旧档（无 pacts 字段）加载后为空白态势', () => {
        const world = createWorld(620, createCityStates());
        world.pacts.truces.liu = 4;
        const data = serializeSave(world) as Record<string, unknown>;
        delete data.pacts;
        const restored = createWorld(617, createCityStates());
        applySave(restored, data as never);
        expect(restored.pacts.truces.liu).toBeUndefined();
        expect(restored.pacts.coalition).toBeNull();
    });

    it('runWorldTurn 完整流转：停战在回合初递减，回合末可产出使节要约', () => {
        const world = liuCorneredWorld();
        world.difficulty = 'hard';
        for (const c of world.cities) {
            if (c.faction === 'liu') { c.army = 20000; c.food = 9999; }
            else if (c.faction === 'tang') c.army = 500;
        }
        world.pacts.truces.liu = 1;
        let calls = 0;
        const seq = () => (calls++ < 6 ? 0.9 : 0.05); // 前段压制随机事件，末段触发勒索
        const out = runWorldTurn(world, seq);
        // 停战 1 回合在回合初递减归零（移除）
        expect(world.pacts.truces.liu).toBeUndefined();
        // TurnOutcome 携带 envoy 字段
        expect('envoy' in out).toBe(true);
    });
});

describe('AIDiplomacy 虎狼暗计', () => {
    function hardWorld() {
        const world = liuCorneredWorld();
        world.difficulty = 'hard';
        for (const c of world.cities) {
            if (c.faction === 'liu') c.army = 20000;
            else if (c.faction === 'tang') c.army = 1000;
        }
        return world;
    }

    it('虎狼难度下强势群雄会施计：成功离间降忠诚、失败也写战报', () => {
        const world = hardWorld();
        const tangCity = world.cities.find((c) => c.faction === 'tang')!;
        tangCity.generalId = 'lijng';
        const general = world.generals.find((g) => g.id === 'lijng')!;
        const loyaltyBefore = general.loyalty;
        // 序列：施计门槛 rng<0.288 ✓(0.05) → 选离间(0.05<0.5 ✓) → 城池/将领索引(0.05) → sowDiscord roll(0.05 必中)
        let calls = 0;
        const seq = () => 0.05;
        const lines = applyAiSchemes(world, seq);
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain('离间计');
        expect(general.loyalty).toBeLessThan(loyaltyBefore);
        expect(world.log.some((l) => l.includes('离间'))).toBe(true);
    });

    it('史实与休明难度不施暗计', () => {
        for (const diff of ['normal', 'easy'] as const) {
            const world = hardWorld();
            world.difficulty = diff;
            expect(applyAiSchemes(world, LOW)).toEqual([]);
        }
    });

    it('停战中的势力不施暗计；弱势群雄无计可施', () => {
        const world = hardWorld();
        world.pacts.truces.liu = 5;
        expect(applyAiSchemes(world, LOW)).toEqual([]);
        // 弱势：liu 兵力低于 0.6×唐军
        const weak = hardWorld();
        for (const c of weak.cities) {
            if (c.faction === 'liu') c.army = 100;
        }
        expect(applyAiSchemes(weak, LOW)).toEqual([]);
    });

    it('谣言路径：无守将时改为散布流言降民心', () => {
        const world = hardWorld();
        // 全部唐城无守将 → 走谣言分支
        for (const c of world.cities) {
            if (c.faction === 'tang') c.generalId = null;
        }
        const moraleBefore = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.morale, 0);
        const lines = applyAiSchemes(world, () => 0.05);
        expect(lines.length).toBe(1);
        expect(lines[0]).toContain('流言');
        const moraleAfter = world.cities.filter((c) => c.faction === 'tang').reduce((s, c) => s + c.morale, 0);
        expect(moraleAfter).toBe(moraleBefore - 6);
    });
});
