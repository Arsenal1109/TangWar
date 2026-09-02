import { describe, it, expect } from 'vitest';
import { SaveSlots, AUTO_SLOT, MANUAL_SLOTS, ALL_SLOTS, slotKey, type StorageLike } from '../assets/scripts/core/SaveSlots';
import { createWorld } from '../assets/scripts/core/WorldState';
import { createCityStates } from '../assets/scripts/core/CityRegistry';
import { serializeSave, applySave } from '../assets/scripts/core/SaveSystem';

function memStorage(): StorageLike & { dump(): Map<string, string> } {
    const m = new Map<string, string>();
    return {
        getItem: (key) => (m.has(key) ? m.get(key)! : null),
        setItem: (key, value) => void m.set(key, value),
        removeItem: (key) => void m.delete(key),
        dump: () => m
    };
}

function makeWorld() {
    return createWorld(619, createCityStates(), [], undefined, [], 'hard');
}

describe('SaveSlots 多存档槽', () => {
    it('槽位键名：自动档沿用 v1 旧键（兼容既有玩家），手动槽独立', () => {
        expect(slotKey(AUTO_SLOT)).toBe('tangwar_save_v1');
        expect(slotKey('slot1')).toBe('tangwar_save_slot1');
        expect(ALL_SLOTS).toHaveLength(4);
        expect(MANUAL_SLOTS).toEqual(['slot1', 'slot2', 'slot3']);
    });

    it('保存/读取/删除往返', () => {
        const store = memStorage();
        const slots = new SaveSlots(store);
        const w = makeWorld();
        slots.save('slot1', serializeSave(w));
        expect(store.dump().has(slotKey('slot1'))).toBe(true);

        const restored = createWorld(617, createCityStates());
        applySave(restored, slots.load('slot1')!);
        expect(restored.year).toBe(619);
        expect(restored.difficulty).toBe('hard');

        slots.remove('slot1');
        expect(slots.load('slot1')).toBeNull();
    });

    it('list() 返回全部四槽摘要，空槽标记 empty', () => {
        const store = memStorage();
        const slots = new SaveSlots(store);
        const w = makeWorld();
        slots.save('slot2', serializeSave(w));

        const list = slots.list();
        expect(list).toHaveLength(4);
        const empty = list.filter((s) => s.empty);
        expect(empty.map((s) => s.slot).sort()).toEqual(['auto', 'slot1', 'slot3'].sort());

        const s2 = list.find((s) => s.slot === 'slot2')!;
        expect(s2.empty).toBe(false);
        expect(s2.year).toBe(619);
        expect(s2.difficulty).toBe('hard');
        expect(s2.tangCities).toBe(3);
        expect(s2.totalCities).toBe(22);
        expect(s2.savedAt).toBeTruthy();
    });

    it('损坏的存档文本按空槽处理，不抛异常', () => {
        const store = memStorage();
        const slots = new SaveSlots(store);
        store.setItem(slotKey('slot1'), '{broken json!!');
        expect(slots.load('slot1')).toBeNull();
        expect(slots.list().find((s) => s.slot === 'slot1')!.empty).toBe(true);
    });

    it('hasAny：任一槽位存在即为 true', () => {
        const store = memStorage();
        const slots = new SaveSlots(store);
        expect(slots.hasAny()).toBe(false);
        slots.save('slot3', serializeSave(makeWorld()));
        expect(slots.hasAny()).toBe(true);
    });
});
