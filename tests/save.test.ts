import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { serializeSave, applySave, SAVE_VERSION } from '../assets/scripts/core/SaveSystem';

// 构造带差异的世界：改年份、改标志、改一座城归属
function armedWorld(): WorldState {
    const w = createWorld(619, createCityStates());
    w.turn = 7;
    w.flags['chengdi'] = true;
    w.flags['wang-chengdi'] = true;
    const c = w.cities.find((x) => x.id === 'luoyang')!;
    c.faction = 'zheng';
    c.morale = 33;
    c.gold = 1200;
    return w;
}

// 复制 JSON 往返
function jsonRoundTrip(data: ReturnType<typeof serializeSave>): ReturnType<typeof serializeSave> {
    return JSON.parse(JSON.stringify(data));
}

describe('SaveSystem 存档', () => {
    it('序列化后回填再序列化：字段往返一致（除 savedAt）', () => {
        const src = armedWorld();
        const d1 = serializeSave(src);
        const restored = createWorld(617, createCityStates());
        applySave(restored, jsonRoundTrip(d1));
        const d2 = serializeSave(restored);
        expect(d2.year).toBe(d1.year);
        expect(d2.seasonIndex).toBe(d1.seasonIndex);
        expect(d2.turn).toBe(d1.turn);
        expect(d2.flags).toEqual(d1.flags);
        expect(d2.cities).toEqual(d1.cities);
        expect(d2.meta.version).toBe(SAVE_VERSION);
    });

    it('applySave 原位回填，保持外层城池引用不变', () => {
        const src = armedWorld();
        const restored = createWorld(617, createCityStates());
        const cityRef = restored.cities.find((x) => x.id === 'luoyang')!;
        applySave(restored, jsonRoundTrip(serializeSave(src)));
        const again = restored.cities.find((x) => x.id === 'luoyang')!;
        expect(again).toBe(cityRef);
    });

    it('版本不兼容时抛出错误', () => {
        const src = armedWorld();
        const data = serializeSave(src) as unknown as { meta: { version: number } };
        data.meta.version = SAVE_VERSION + 1;
        const w = createWorld(617, createCityStates());
        expect(() => applySave(w, data as never)).toThrow(/版本/);
    });

    it('JSON 字符串可持久化并完整还原', () => {
        const src = armedWorld();
        const text = JSON.stringify(serializeSave(src));
        const restored = createWorld(617, createCityStates());
        applySave(restored, JSON.parse(text));
        expect(restored.year).toBe(619);
        expect(restored.cities.find((x) => x.id === 'luoyang')!.faction).toBe('zheng');
        expect(restored.flags['chengdi']).toBe(true);
    });
});