import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { createGeneralStates } from '../assets/scripts/core/GeneralSystem';
import { createDiplomacyState, performDiplo } from '../assets/scripts/core/Diplomacy';
import { serializeSave, applySave, SAVE_VERSION, type SaveData } from '../assets/scripts/core/SaveSystem';
import { tickWorldMarches } from '../assets/scripts/core/MarchSystem';

// 构造带差异的世界：改年份、改标志、改城池归属、改外交与将领忠诚
function armedWorld(): WorldState {
    const w = createWorld(619, createCityStates(), createGeneralStates(), createDiplomacyState());
    w.turn = 7;
    w.flags['chengdi'] = true;
    w.flags['wang-chengdi'] = true;
    const c = w.cities.find((x) => x.id === 'luoyang')!;
    c.faction = 'zheng';
    c.morale = 33;
    c.gold = 1200;
    // 外交：向瓦岗进贡改善关系
    performDiplo(w.diplomacy, 'tang', 'wa', 'tribute', { gold: 9999, prestige: 50, armyPower: 50000, rng: () => 0.1 });
    // 将领忠诚变化
    const gm = w.generals.find((g) => g.id === 'lishimin')!;
    gm.loyalty = 77;
    return w;
}

function jsonRoundTrip(data: SaveData): SaveData {
    return JSON.parse(JSON.stringify(data));
}

describe('SaveSystem v2 存档', () => {
    it('序列化后回填再序列化：字段往返一致（除 savedAt）', () => {
        const src = armedWorld();
        const d1 = serializeSave(src);
        const restored = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        applySave(restored, jsonRoundTrip(d1));
        const d2 = serializeSave(restored);
        expect(d2.year).toBe(d1.year);
        expect(d2.seasonIndex).toBe(d1.seasonIndex);
        expect(d2.turn).toBe(d1.turn);
        expect(d2.flags).toEqual(d1.flags);
        expect(d2.cities).toEqual(d1.cities);
        expect(d2.generals).toEqual(d1.generals);
        expect(d2.diplomacy).toEqual(d1.diplomacy);
        expect(d2.marches).toEqual(d1.marches);
        expect(d2.meta.version).toBe(SAVE_VERSION);
    });

    it('v2 持久化外交关系、将领忠诚与行军令', () => {
        const src = armedWorld();
        // 挂一条进行中的行军令：太原 → 洛阳（敌城）
        src.marches.push({
            id: 'm-test',
            fromId: 'taiyuan',
            toId: 'luoyang',
            troops: { fubing: 3000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 },
            turnsLeft: 2,
            speed: 1,
            command: 98,
            faction: 'tang'
        });
        const restored = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        applySave(restored, jsonRoundTrip(serializeSave(src)));
        expect(restored.diplomacy.relations['wa']).toBe(50); // 初始 20 + 进贡 30 已持久化
        expect(restored.generals.find((g) => g.id === 'lishimin')!.loyalty).toBe(77);
        expect(restored.marches.length).toBe(1);
        expect(restored.marches[0].command).toBe(98);
        expect(restored.marches[0].turnsLeft).toBe(2);
    });

    it('v1 存档迁移：缺失字段用世界默认值兜底，不抛错', () => {
        const src = armedWorld();
        const data = serializeSave(src) as SaveData;
        (data.meta as { version: number }).version = 1;
        delete data.generals;
        delete data.diplomacy;
        delete data.marches;
        const restored = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        expect(() => applySave(restored, data)).not.toThrow();
        expect(restored.year).toBe(619);
        expect(restored.cities.find((x) => x.id === 'luoyang')!.faction).toBe('zheng');
        expect(restored.generals.find((g) => g.id === 'lishimin')!.loyalty).toBe(100); // 默认忠诚
        expect(restored.diplomacy.relations['wa']).toBe(20); // 默认初始关系
        expect(restored.marches).toEqual([]);
    });

    it('applySave 原位回填，保持外层城池引用不变', () => {
        const src = armedWorld();
        const restored = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        const cityRef = restored.cities.find((x) => x.id === 'luoyang')!;
        applySave(restored, jsonRoundTrip(serializeSave(src)));
        const again = restored.cities.find((x) => x.id === 'luoyang')!;
        expect(again).toBe(cityRef);
    });

    it('未来版本（v3）不兼容时抛出错误', () => {
        const src = armedWorld();
        const data = serializeSave(src) as unknown as { meta: { version: number } };
        data.meta.version = SAVE_VERSION + 1;
        const w = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        expect(() => applySave(w, data as never)).toThrow(/版本/);
    });

    it('JSON 字符串可持久化并完整还原', () => {
        const src = armedWorld();
        const text = JSON.stringify(serializeSave(src));
        const restored = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        applySave(restored, JSON.parse(text));
        expect(restored.year).toBe(619);
        expect(restored.cities.find((x) => x.id === 'luoyang')!.faction).toBe('zheng');
        expect(restored.flags['chengdi']).toBe(true);
    });
});

describe('世界级行军 tickWorldMarches', () => {
    it('到达己方城池：兵力并入守军', () => {
        const w = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        const jinyang = w.cities.find((c) => c.id === 'jinyang')!;
        const before = jinyang.army;
        w.marches.push({
            id: 'm1', fromId: 'taiyuan', toId: 'jinyang',
            troops: { fubing: 2000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 },
            turnsLeft: 1, speed: 1, faction: 'tang', command: 98
        });
        const arrivals = tickWorldMarches(w, () => 0.5);
        expect(w.marches.length).toBe(0); // 行军令完成并移除
        expect(jinyang.army).toBe(before + 2000);
        expect(arrivals[0].joined).toBe(true);
        expect(w.log.some((l) => l.includes('援军进驻'))).toBe(true);
    });

    it('到达敌城：真实攻城战，大优兵力可破城', () => {
        const w = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        const mayi = w.cities.find((c) => c.id === 'mayi')!;
        mayi.army = 50;
        mayi.troops = { fubing: 50, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 };
        mayi.defense = 0;
        w.marches.push({
            id: 'm2', fromId: 'taiyuan', toId: 'mayi',
            troops: { fubing: 8000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 },
            turnsLeft: 1, speed: 1, faction: 'tang', command: 98
        });
        const arrivals = tickWorldMarches(w, () => 0.0);
        expect(mayi.faction).toBe('tang');
        expect(arrivals[0].captured).toBe(true);
        expect(w.log.some((l) => l.includes('攻破'))).toBe(true);
    });

    it('未到期的行军令每回合推进 1 回合且不结算', () => {
        const w = createWorld(617, createCityStates(), createGeneralStates(), createDiplomacyState());
        w.marches.push({
            id: 'm3', fromId: 'taiyuan', toId: 'changan',
            troops: { fubing: 1000, jingbing: 0, qibing: 0, nubing: 0, xuanjia: 0, shuijun: 0 },
            turnsLeft: 3, speed: 1, faction: 'tang'
        });
        tickWorldMarches(w, () => 0.5);
        expect(w.marches.length).toBe(1);
        expect(w.marches[0].turnsLeft).toBe(2);
        expect(w.log.length).toBe(0);
    });
});
